/**
 * Public API for agent-evals.
 * Orchestrates three modes: spec-based, transcript evaluation, and prompt-based.
 */

import { dirname, join, resolve } from "node:path";
import { discoverEvalSpecs } from "./discovery.js";
import { parseEvalSource, ParseError } from "./parser.js";
import { extractCriteria, applyCriteriaOverrides } from "./extractor.js";
import { executeTrial, runSetup, runTeardown } from "./runner.js";
import { runGrader } from "./graders/index.js";
import { parseTranscriptFile } from "./transcript-parser.js";
import { resolveArtifacts } from "./artifact-resolver.js";
import { assembleCriteria } from "./criteria-assembler.js";
import { judgeAllCriteria, judgeCriteriaQuality, formatTranscriptForJudge } from "./judge.js";
import { runPrompt } from "./prompt-runner.js";
import { loadConfig } from "./config.js";
import {
  appendHistory,
  loadHistory,
  compareToLast,
  buildSpecHistoryEntry,
  buildTranscriptHistoryEntry,
  printHistoryTrend,
} from "./history.js";
import { writeJsonReport, writeTranscriptJsonReport } from "./reporter/json.js";
import { printCliReport, printTranscriptReport } from "./reporter/cli.js";
import { writeMarkdownReport, writeTranscriptMarkdownReport } from "./reporter/markdown.js";
import type {
  CLIOptions,
  EvalSpec,
  EvalResult,
  CaseResult,
  TrialResult,
  GraderResult,
  FullReport,
  TranscriptEvalReport,
  ExtractedCriteria,
  TranscriptMessage,
} from "./types.js";

// Re-export types and key modules
export type {
  EvalSpec,
  EvalResult,
  CaseResult,
  TrialResult,
  GraderResult,
  FullReport,
  TranscriptEvalReport,
  CLIOptions,
  ExtractedCriteria,
} from "./types.js";
export { parseEvalSource } from "./parser.js";
export { discoverEvalSpecs } from "./discovery.js";
export { extractCriteria, applyCriteriaOverrides } from "./extractor.js";
export { runGrader, listGraders } from "./graders/index.js";

/**
 * Main entry point — routes to the appropriate mode.
 */
export async function runEvals(options: CLIOptions): Promise<number> {
  const config = await loadConfig(process.cwd());
  const outputDir = options.output ?? resolve(config.output_dir);
  const verbose = options.verbose || config.verbose;

  // History-only mode
  if (options.history) {
    const history = await loadHistory(outputDir);
    printHistoryTrend(history);
    return 0;
  }

  // Route to appropriate mode
  if (options.transcript) {
    return runTranscriptMode(options, config, outputDir, verbose);
  }

  if (options.prompt) {
    return runPromptMode(options, config, outputDir, verbose);
  }

  return runSpecMode(options, config, outputDir, verbose);
}

// ── Spec Mode ────────────────────────────────────────────────────

async function runSpecMode(
  options: CLIOptions,
  config: { judge_model: string; pass_threshold: number; report: string },
  outputDir: string,
  verbose: boolean
): Promise<number> {
  const startTime = Date.now();

  // 1. Discover
  const sources = await discoverEvalSpecs(options.path);
  if (sources.length === 0) {
    console.log("No eval specs found. Add `evals:` to artifact frontmatter or place YAML files in evals/ directories.");
    return 0;
  }

  // 2. Parse
  const specs: Array<{ spec: EvalSpec; file: string }> = [];
  for (const source of sources) {
    try {
      const parsed = await parseEvalSource(source);
      for (const spec of parsed) {
        if (options.filter && !spec.name.includes(options.filter)) continue;
        specs.push({ spec, file: source.file });
      }
    } catch (error) {
      if (error instanceof ParseError) {
        console.error(`Parse error: ${error.message}`);
      } else {
        console.error(`Error loading ${source.file}: ${(error as Error).message}`);
      }
      if (options.bail) return 1;
    }
  }

  if (specs.length === 0) {
    console.log("No eval specs matched filters.");
    return 0;
  }

  // Dry-run
  if (options.dry_run) {
    console.log(`\nValidated ${specs.length} eval spec(s):\n`);
    for (const { spec, file } of specs) {
      console.log(`  ${spec.name} (${spec.artifact.type})`);
      console.log(`    Source: ${file}`);
      console.log(`    Cases: ${spec.cases.length}, Trials: ${spec.trials}, Model: ${spec.model}`);
      try {
        const extracted = await extractCriteria(spec.artifact.type, spec.artifact.path, dirname(file));
        const count = Object.values(extracted).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
        );
        console.log(`    Auto-extracted criteria: ${count}`);
      } catch (err) {
        console.log(`    Auto-extraction failed: ${(err as Error).message}`);
      }
      console.log();
    }
    return 0;
  }

  // 3. Execute
  const evalResults: EvalResult[] = [];
  let totalCost = 0;
  let hasFailures = false;
  const concurrency = options.concurrency ?? 1;

  for (let i = 0; i < specs.length; i += concurrency) {
    const batch = specs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(({ spec, file }) => runSingleEval(spec, file, options, config, outputDir, verbose))
    );

    for (const result of batchResults) {
      evalResults.push(result.evalResult);
      totalCost += result.cost;
      if (result.hasFailures) hasFailures = true;
    }

    if (options.bail && hasFailures) break;
  }

  // 4. Report
  const duration = Date.now() - startTime;
  const totalCases = evalResults.reduce((sum, e) => sum + e.cases.length, 0);
  const passedCases = evalResults.reduce(
    (sum, e) => sum + e.cases.filter((c) => c.pass_pow_k).length, 0
  );

  // Build history entry
  const perCriterion: Record<string, { pass: boolean; score: number }> = {};
  for (const ev of evalResults) {
    for (const c of ev.cases) {
      perCriterion[`${ev.name}/${c.name}`] = {
        pass: c.pass_pow_k,
        score: c.pass_pow_k ? 1 : 0,
      };
    }
  }

  const historyEntry = buildSpecHistoryEntry(options.path, totalCases, passedCases, totalCost, perCriterion);
  const history = await loadHistory(outputDir);
  const comparison = compareToLast(historyEntry, history);
  await appendHistory(historyEntry, outputDir);

  const report: FullReport = {
    summary: {
      total_cases: totalCases,
      passed: passedCases,
      failed: totalCases - passedCases,
      pass_rate: totalCases > 0 ? passedCases / totalCases : 0,
      total_cost_usd: totalCost,
      duration_ms: duration,
    },
    evals: evalResults,
    comparison,
  };

  const jsonPath = await writeJsonReport(report, outputDir);
  printCliReport(report);
  console.log(`Report: ${jsonPath}`);

  const reportFormat = options.report_format ?? config.report;
  if (reportFormat === "markdown" || reportFormat === "both" || options.report) {
    const mdPath = await writeMarkdownReport(report, outputDir);
    console.log(`Markdown: ${mdPath}`);
  }

  return hasFailures ? 1 : 0;
}

async function runSingleEval(
  spec: EvalSpec,
  specFile: string,
  options: CLIOptions,
  config: { judge_model: string },
  outputDir: string,
  verbose: boolean
): Promise<{ evalResult: EvalResult; cost: number; hasFailures: boolean }> {
  const specDir = dirname(specFile);
  const model = options.model ?? spec.model;
  const judgeModel = options.judge_model ?? config.judge_model ?? spec.judge_model;
  const trials = options.trials ?? spec.trials;

  let extracted: ExtractedCriteria = {};
  try {
    extracted = await extractCriteria(spec.artifact.type, spec.artifact.path, specDir);
    extracted = applyCriteriaOverrides(extracted, spec.criteria_overrides);
  } catch (err) {
    if (verbose) {
      console.warn(`  Warning: criteria extraction failed: ${(err as Error).message}`);
    }
  }

  const caseResults: CaseResult[] = [];
  let totalCost = 0;
  let hasFailures = false;

  for (const evalCase of spec.cases) {
    const trialResults: TrialResult[] = [];

    for (let t = 1; t <= trials; t++) {
      runSetup(spec.setup);

      try {
        const trialOutputDir = join(outputDir, "transcripts", spec.name, evalCase.name);
        const { context } = await executeTrial(
          evalCase, spec.sdk_options, model, extracted, trialOutputDir, t
        );

        const graderResults: GraderResult[] = [];
        for (const criterion of evalCase.criteria) {
          const result = await runGrader(criterion, context, judgeModel);
          graderResults.push(result);
          if (verbose) {
            const icon = result.pass ? "\u2713" : "\u2717";
            console.log(`    ${icon} ${result.name}: ${result.reasoning}`);
          }
        }

        trialResults.push({
          trial_number: t,
          criteria: graderResults,
          pass: graderResults.every((r) => r.pass),
          transcript_path: join(trialOutputDir, `trial-${t}.jsonl`),
          cost_usd: context.cost_usd,
          duration_ms: context.duration_ms,
          num_turns: context.num_turns,
        });

        totalCost += context.cost_usd;
      } catch (error) {
        trialResults.push({
          trial_number: t,
          criteria: [{
            name: "execution", grader: "system", pass: false, score: 0.0,
            reasoning: `Trial execution failed: ${(error as Error).message}`,
          }],
          pass: false,
          transcript_path: "",
          cost_usd: 0,
          duration_ms: 0,
          num_turns: 0,
        });
      } finally {
        runTeardown(spec.teardown);
      }
    }

    const passAtK = trialResults.some((t) => t.pass);
    const passPowK = trialResults.every((t) => t.pass);

    const criterionNames = new Set<string>();
    for (const trial of trialResults) {
      for (const c of trial.criteria) criterionNames.add(c.name);
    }

    const perCriterionPassRate: Record<string, number> = {};
    for (const name of criterionNames) {
      const passed = trialResults.filter((t) =>
        t.criteria.find((c) => c.name === name)?.pass ?? false
      ).length;
      perCriterionPassRate[name] = passed / trialResults.length;
    }

    if (!passPowK) hasFailures = true;

    caseResults.push({
      name: evalCase.name,
      trials: trialResults,
      pass_at_k: passAtK,
      pass_pow_k: passPowK,
      per_criterion_pass_rate: perCriterionPassRate,
    });

    if (options.bail && hasFailures) break;
  }

  return {
    evalResult: { name: spec.name, artifact: spec.artifact, type: spec.type, cases: caseResults },
    cost: totalCost,
    hasFailures,
  };
}

// ── Transcript Mode ──────────────────────────────────────────────

async function runTranscriptMode(
  options: CLIOptions,
  config: { judge_model: string; pass_threshold: number; report: string },
  outputDir: string,
  verbose: boolean
): Promise<number> {
  const judgeModel = options.judge_model ?? config.judge_model;

  console.log(`Parsing transcript: ${options.transcript}`);
  const parsed = await parseTranscriptFile(options.transcript!);

  return evaluateTranscript(
    parsed,
    { type: "transcript", value: options.transcript! },
    judgeModel,
    config.pass_threshold,
    outputDir,
    options,
    config,
    verbose
  );
}

// ── Prompt Mode ──────────────────────────────────────────────────

async function runPromptMode(
  options: CLIOptions,
  config: { judge_model: string; pass_threshold: number; report: string },
  outputDir: string,
  verbose: boolean
): Promise<number> {
  const judgeModel = options.judge_model ?? config.judge_model;

  console.log(`Running prompt via claude CLI...`);
  const result = await runPrompt({
    prompt: options.prompt!,
    model: options.model,
    streamToStdout: true,
  });

  if (result.exitCode !== 0 && result.messages.length === 0) {
    console.error("claude CLI failed with no output.");
    return 1;
  }

  // Parse the captured output
  const { parseTranscriptContent } = await import("./transcript-parser.js");
  const parsed = parseTranscriptContent(result.rawJsonl);

  return evaluateTranscript(
    parsed,
    { type: "prompt", value: options.prompt! },
    judgeModel,
    config.pass_threshold,
    outputDir,
    options,
    config,
    verbose
  );
}

// ── Shared transcript evaluation pipeline ────────────────────────

async function evaluateTranscript(
  parsed: import("./types.js").ParsedTranscript,
  source: { type: "transcript" | "prompt"; value: string },
  judgeModel: string,
  passThreshold: number,
  outputDir: string,
  options: CLIOptions,
  config: { report: string },
  verbose: boolean
): Promise<number> {
  // 1. Resolve artifacts
  if (verbose) {
    console.log(`  CWD: ${parsed.cwd}`);
    console.log(`  Skills: ${parsed.invoked_skills.join(", ") || "none"}`);
    console.log(`  Agents: ${[...parsed.declared_agents, ...parsed.spawned_agents].join(", ") || "none"}`);
  }

  console.log("Resolving artifacts...");
  const artifacts = await resolveArtifacts(parsed);
  console.log(`  Found ${artifacts.length} artifact(s)`);

  if (artifacts.length === 0) {
    console.log("No artifacts found to evaluate.");
    return 0;
  }

  // 2. Assemble criteria
  console.log("Assembling criteria...");
  const criteria = await assembleCriteria(artifacts, options.detect_criteria);

  if (criteria.length === 0) {
    console.log("No criteria found to evaluate.");
    return 0;
  }

  // 3. Format transcript for judge
  const transcriptText = formatTranscriptForJudge(
    parsed.messages.map((m) => m as unknown as TranscriptMessage)
  );

  // 4. Judge adherence
  console.log(`Judging ${criteria.length} criteria...`);
  const judgments = await judgeAllCriteria(criteria, transcriptText, judgeModel);

  // 5. Judge criteria quality
  console.log("Scoring criteria quality...");
  const quality = await judgeCriteriaQuality(criteria, judgeModel);

  // 6. Build report
  const passed = judgments.filter((j) => j.pass).length;
  const total = judgments.length;
  const avgScore = total > 0 ? judgments.reduce((s, j) => s + j.score, 0) / total : 0;
  const meanClarity = quality.length > 0 ? quality.reduce((s, q) => s + q.clarity, 0) / quality.length : 0;
  const meanAssessability = quality.length > 0 ? quality.reduce((s, q) => s + q.assessability, 0) / quality.length : 0;

  // Build history entry
  const perCriterion: Record<string, { pass: boolean; score: number }> = {};
  for (const j of judgments) {
    perCriterion[j.criterion.text] = { pass: j.pass, score: j.score };
  }

  const mode = source.type === "transcript" ? "transcript" as const : "prompt" as const;
  const historyEntry = buildTranscriptHistoryEntry(mode, source.value, total, passed, avgScore, 0, perCriterion);
  const history = await loadHistory(outputDir);
  const comparison = compareToLast(historyEntry, history);
  await appendHistory(historyEntry, outputDir);

  const report: TranscriptEvalReport = {
    timestamp: new Date().toISOString(),
    source,
    transcript_summary: {
      cwd: parsed.cwd,
      model: parsed.model,
      num_turns: parsed.result?.num_turns ?? 0,
      cost_usd: parsed.result?.total_cost_usd ?? 0,
      status: parsed.result?.is_error ? "error" : "success",
      skills: parsed.invoked_skills,
      agents: [...parsed.declared_agents, ...parsed.spawned_agents],
    },
    artifacts: artifacts.map((a) => ({
      name: a.name,
      type: a.type,
      path: a.resolved_path,
      criteria_count: criteria.filter((c) => c.source_artifact === a.name).length,
      criteria_source: criteria.some((c) => c.source_artifact === a.name && c.origin === "frontmatter")
        ? "frontmatter" : "body-extraction",
    })),
    judgments,
    criteria_quality: quality,
    summary: {
      total,
      passed,
      failed: total - passed,
      score: avgScore,
      pass: avgScore >= passThreshold,
      mean_clarity: meanClarity,
      mean_assessability: meanAssessability,
      judge_cost_usd: 0, // TODO: track actual judge cost
    },
    comparison,
  };

  // 7. Output
  const jsonPath = await writeTranscriptJsonReport(report, outputDir);
  printTranscriptReport(report);
  console.log(`Report: ${jsonPath}`);

  const reportFormat = options.report_format ?? config.report;
  if (reportFormat === "markdown" || reportFormat === "both" || options.report) {
    const mdPath = await writeTranscriptMarkdownReport(report, outputDir);
    console.log(`Markdown: ${mdPath}`);
  }

  return report.summary.pass ? 0 : 1;
}
