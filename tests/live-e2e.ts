#!/usr/bin/env npx tsx
/**
 * Live end-to-end integration test.
 *
 * This script runs a REAL evaluation against the Claude CLI — no mocks,
 * no fixtures, no shortcuts. It exercises every layer of the framework:
 *
 *   1. Write a temporary skill artifact + eval spec
 *   2. discoverEvalSpecs()  — find the spec
 *   3. parseEvalSource()    — parse it
 *   4. extractCriteria()    — auto-extract from the skill body
 *   5. executeTrial()       — spawn `claude -p` and capture transcript
 *   6. runGrader()          — run every code grader on the result
 *   7. formatTranscriptForJudge() — format for LLM judge
 *   8. invokeJudge()        — call Claude as LLM-as-judge
 *   9. writeJsonReport()    — write JSON report
 *  10. writeMarkdownReport() — write Markdown report
 *  11. appendHistory()      — persist to history
 *  12. loadHistory() + compareToLast() — compare
 *
 * Usage:
 *   cd agent-evals
 *   npx tsx tests/live-e2e.ts
 *
 * Estimated cost: ~$0.05–0.15 depending on model.
 */

import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ── Source imports ─────────────────────────────────────────────────
import { discoverEvalSpecs } from "../src/discovery.js";
import { parseEvalSource } from "../src/parser.js";
import { extractCriteria, applyCriteriaOverrides } from "../src/extractor.js";
import { executeTrial, runSetup, runTeardown } from "../src/runner.js";
import { runGrader, listGraders } from "../src/graders/index.js";
import { formatTranscriptForJudge, invokeJudge } from "../src/judge.js";
import { writeJsonReport } from "../src/reporter/json.js";
import { writeMarkdownReport } from "../src/reporter/markdown.js";
import {
  appendHistory,
  loadHistory,
  compareToLast,
  buildSpecHistoryEntry,
} from "../src/history.js";
import type {
  EvalSpec,
  GraderResult,
  TrialResult,
  CaseResult,
  FullReport,
  Criterion,
} from "../src/types.js";

// ── Helpers ───────────────────────────────────────────────────────

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function header(step: number, title: string) {
  console.log(`\n${BOLD}${CYAN}━━━ Step ${step}: ${title} ━━━${RESET}\n`);
}

function pass(msg: string) {
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}

function fail(msg: string) {
  console.log(`  ${RED}✗${RESET} ${msg}`);
}

function info(msg: string) {
  console.log(`  ${DIM}${msg}${RESET}`);
}

function kv(key: string, value: unknown) {
  console.log(`  ${YELLOW}${key}:${RESET} ${value}`);
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const runId = randomUUID().slice(0, 8);
  const workDir = join(tmpdir(), `agent-evals-live-${runId}`);
  const outputDir = join(workDir, "eval-results");

  console.log(`${BOLD}╔══════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║   agent-evals: Live End-to-End Integration Test     ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════╝${RESET}`);
  console.log();
  kv("Run ID", runId);
  kv("Work directory", workDir);
  kv("Registered graders", listGraders().length);
  console.log();

  const startTime = Date.now();
  let totalAssertions = 0;
  let passedAssertions = 0;

  function assert(condition: boolean, msg: string) {
    totalAssertions++;
    if (condition) {
      passedAssertions++;
      pass(msg);
    } else {
      fail(msg);
    }
  }

  try {
    // ── Step 0: Create workspace ────────────────────────────────

    header(0, "Create temporary workspace");

    await mkdir(join(workDir, "skills"), { recursive: true });
    await mkdir(join(workDir, "evals"), { recursive: true });

    // Write a real skill file
    const skillPath = join(workDir, "skills", "SKILL.md");
    await writeFile(skillPath, `---
name: math-helper
description: 'Solve simple math problems and explain the reasoning'
---

# Math Helper Skill

A skill that solves arithmetic problems step by step.

## Entry Criteria

- User provides a math expression or word problem
- Problem is within basic arithmetic scope (add, subtract, multiply, divide)

## Exit Criteria

- Correct numerical answer is provided
- Brief explanation of the steps is included

## Process Steps

1. Parse the math expression from the user's prompt
2. Compute the result step by step
3. Present the answer with a short explanation

## Constraints

- Do not use external tools for simple arithmetic
- Provide the answer directly, do not ask clarifying questions
`);

    // Write an eval spec
    const evalPath = join(workDir, "evals", "math-helper.yaml");
    await writeFile(evalPath, `name: math-helper-eval
description: End-to-end eval of the math-helper skill
type: capability
artifact:
  type: skill
  path: ../skills/SKILL.md

trials: 1
model: claude-sonnet-4-6
judge_model: claude-sonnet-4-6

sdk_options:
  max_turns: 3

cases:
  - name: basic-addition
    prompt: "What is 17 + 28? Show your work."
    criteria:
      - name: correct-answer
        type: code
        grader: regex-match
        config:
          pattern: "45"
          expect: present

      - name: within-budget
        type: code
        grader: cost-check
        config:
          max_cost_usd: 1.00

      - name: efficient
        type: code
        grader: turn-count
        config:
          max_turns: 5

      - name: no-skill-invocation
        type: code
        grader: trigger-check
        config:
          skill_name: math-helper
          should_trigger: false

      - name: quality-check
        type: llm
        grader: output-quality
        config:
          rubric: "The response should contain the correct answer (45) and a brief explanation of how 17+28=45."
`);

    info(`Skill artifact: ${skillPath}`);
    info(`Eval spec: ${evalPath}`);
    pass("Workspace created");

    // ── Step 1: Discover ────────────────────────────────────────

    header(1, "discoverEvalSpecs()");

    const sources = await discoverEvalSpecs(join(workDir, "evals"));
    kv("Sources found", sources.length);
    for (const s of sources) {
      kv("  File", s.file);
      kv("  Source type", s.source);
    }
    assert(sources.length === 1, "Found exactly 1 eval source");
    assert(sources[0].source === "standalone", "Source is standalone YAML");

    // ── Step 2: Parse ───────────────────────────────────────────

    header(2, "parseEvalSource()");

    const specs = await parseEvalSource(sources[0]);
    const spec = specs[0];
    kv("Spec name", spec.name);
    kv("Type", spec.type);
    kv("Artifact", `${spec.artifact.type} → ${spec.artifact.path}`);
    kv("Trials", spec.trials);
    kv("Model", spec.model);
    kv("Judge model", spec.judge_model);
    kv("Cases", spec.cases.length);
    for (const c of spec.cases) {
      kv(`  Case "${c.name}"`, `${c.criteria.length} criteria`);
      for (const cr of c.criteria) {
        info(`    ${cr.name} (${cr.type}/${cr.grader})`);
      }
    }
    assert(spec.name === "math-helper-eval", "Spec name parsed correctly");
    assert(spec.cases.length === 1, "1 case parsed");
    assert(spec.cases[0].criteria.length === 5, "5 criteria parsed (4 code + 1 LLM)");

    // ── Step 3: Extract criteria from artifact ──────────────────

    header(3, "extractCriteria()");

    const extracted = await extractCriteria(
      spec.artifact.type,
      spec.artifact.path,
      join(workDir, "evals")
    );
    kv("Entry criteria", extracted.entry?.length ?? 0);
    for (const e of extracted.entry ?? []) info(`  - ${e}`);
    kv("Exit criteria", extracted.exit?.length ?? 0);
    for (const e of extracted.exit ?? []) info(`  - ${e}`);
    kv("Process steps", extracted.process_steps?.length ?? 0);
    for (const p of extracted.process_steps ?? []) info(`  - ${p}`);
    kv("Trigger description", extracted.trigger_description ?? "(none)");

    assert((extracted.entry?.length ?? 0) >= 2, "Extracted ≥2 entry criteria");
    assert((extracted.exit?.length ?? 0) >= 2, "Extracted ≥2 exit criteria");
    assert((extracted.process_steps?.length ?? 0) >= 3, "Extracted ≥3 process steps");
    assert(!!extracted.trigger_description, "Trigger description extracted");

    // Test overrides
    const overridden = applyCriteriaOverrides(extracted, {
      entry: ["Custom entry criterion"],
    });
    assert(
      overridden.entry?.length === 1 && overridden.entry[0] === "Custom entry criterion",
      "applyCriteriaOverrides replaces entry"
    );
    assert(
      JSON.stringify(overridden.exit) === JSON.stringify(extracted.exit),
      "applyCriteriaOverrides preserves non-overridden fields"
    );

    // ── Step 4: Execute trial ───────────────────────────────────

    header(4, "executeTrial() — spawning claude -p");

    console.log(`  ${YELLOW}⏳ Running claude -p ... (this will take a moment)${RESET}`);
    const trialStart = Date.now();

    const evalCase = spec.cases[0];
    const trialOutputDir = join(outputDir, "transcripts", spec.name, evalCase.name);

    const { context, transcript } = await executeTrial(
      evalCase,
      { ...spec.sdk_options, cwd: workDir },
      spec.model,
      extracted,
      trialOutputDir,
      1
    );

    const trialDuration = Date.now() - trialStart;

    kv("Duration", `${(trialDuration / 1000).toFixed(1)}s`);
    kv("Cost", `$${context.cost_usd.toFixed(4)}`);
    kv("Turns", context.num_turns);
    kv("Transcript messages", context.transcript.length);
    kv("Workspace files (before)", context.workspace_before.size);
    kv("Workspace files (after)", context.workspace_after.size);

    // Show transcript summary
    console.log();
    info("Transcript summary:");
    for (const msg of context.transcript) {
      const role = msg.role ?? msg.type ?? "?";
      if (typeof msg.content === "string") {
        info(`  [${role}] ${msg.content.slice(0, 120)}${msg.content.length > 120 ? "..." : ""}`);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content as Array<Record<string, unknown>>) {
          if (block?.type === "text") {
            const text = block.text as string;
            info(`  [${role}] ${text.slice(0, 120)}${text.length > 120 ? "..." : ""}`);
          } else if (block?.type === "tool_use") {
            info(`  [${role}:tool_use] ${block.name}(...)`);
          }
        }
      }
    }

    assert(context.transcript.length > 0, "Transcript has messages");
    assert(context.cost_usd > 0, "Cost is non-zero");
    assert(context.num_turns >= 1, "At least 1 turn");

    // ── Step 5: Run code graders ────────────────────────────────

    header(5, "runGrader() — code graders");

    const codeGraderResults: GraderResult[] = [];
    const codeCriteria = evalCase.criteria.filter((c) => c.type === "code");

    for (const criterion of codeCriteria) {
      const result = await runGrader(criterion, context, spec.judge_model);
      codeGraderResults.push(result);

      const icon = result.pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`  ${icon} ${BOLD}${result.name}${RESET} (${result.grader})`);
      kv("    Score", result.score);
      kv("    Reasoning", result.reasoning);
      if (result.evidence && Object.keys(result.evidence).length > 0) {
        kv("    Evidence", JSON.stringify(result.evidence).slice(0, 200));
      }
      console.log();
    }

    assert(codeGraderResults.length === 4, "Ran 4 code graders");
    for (const r of codeGraderResults) {
      assert(typeof r.pass === "boolean", `${r.name}: pass is boolean`);
      assert(typeof r.score === "number", `${r.name}: score is number`);
      assert(r.reasoning.length > 0, `${r.name}: has reasoning`);
    }

    // ── Step 6: Format transcript for judge ─────────────────────

    header(6, "formatTranscriptForJudge()");

    const formattedTranscript = formatTranscriptForJudge(context.transcript);
    kv("Formatted length", `${formattedTranscript.length} chars`);
    info("First 300 chars:");
    info(formattedTranscript.slice(0, 300));

    assert(formattedTranscript.length > 0, "Formatted transcript is non-empty");

    // ── Step 7: LLM-as-judge ────────────────────────────────────

    header(7, "invokeJudge() — LLM-as-judge via claude -p");

    const llmCriteria = evalCase.criteria.filter((c) => c.type === "llm");
    const llmResults: GraderResult[] = [];

    for (const criterion of llmCriteria) {
      console.log(`  ${YELLOW}⏳ Judging "${criterion.name}" ...${RESET}`);
      const result = await runGrader(criterion, context, spec.judge_model);
      llmResults.push(result);

      const icon = result.pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`  ${icon} ${BOLD}${result.name}${RESET} (${result.grader})`);
      kv("    Score", result.score);
      kv("    Reasoning", result.reasoning);
      console.log();
    }

    assert(llmResults.length === 1, "Ran 1 LLM grader");
    assert(typeof llmResults[0].pass === "boolean", "LLM grader returned pass boolean");
    assert(typeof llmResults[0].score === "number", "LLM grader returned numeric score");
    assert(llmResults[0].reasoning.length > 10, "LLM grader provided substantive reasoning");

    // ── Step 8: Build trial + case results ──────────────────────

    header(8, "Assemble results");

    const allResults = [...codeGraderResults, ...llmResults];
    const trialPass = allResults.every((r) => r.pass);

    const trialResult: TrialResult = {
      trial_number: 1,
      criteria: allResults,
      pass: trialPass,
      transcript_path: join(trialOutputDir, "trial-1.jsonl"),
      cost_usd: context.cost_usd,
      duration_ms: trialDuration,
      num_turns: context.num_turns,
    };

    const perCriterionPassRate: Record<string, number> = {};
    for (const r of allResults) {
      perCriterionPassRate[r.name] = r.pass ? 1.0 : 0.0;
    }

    const caseResult: CaseResult = {
      name: evalCase.name,
      trials: [trialResult],
      pass_at_k: trialPass,
      pass_pow_k: trialPass,
      per_criterion_pass_rate: perCriterionPassRate,
    };

    kv("Trial pass", trialPass);
    kv("Criteria results", `${allResults.filter((r) => r.pass).length}/${allResults.length} passed`);
    for (const r of allResults) {
      const icon = r.pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`  ${icon} ${r.name}: ${r.score.toFixed(2)} — ${r.reasoning.slice(0, 80)}`);
    }

    assert(allResults.length === 5, "5 total grader results");

    // ── Step 9: Write JSON report ───────────────────────────────

    header(9, "writeJsonReport()");

    const report: FullReport = {
      summary: {
        total_cases: 1,
        passed: trialPass ? 1 : 0,
        failed: trialPass ? 0 : 1,
        pass_rate: trialPass ? 1.0 : 0.0,
        total_cost_usd: context.cost_usd,
        duration_ms: trialDuration,
      },
      evals: [{
        name: spec.name,
        artifact: spec.artifact,
        type: spec.type,
        cases: [caseResult],
      }],
    };

    const jsonPath = await writeJsonReport(report, outputDir);
    kv("JSON report", jsonPath);

    const jsonContent = JSON.parse(await readFile(jsonPath, "utf-8"));
    assert(jsonContent.summary.total_cases === 1, "JSON report has 1 case");
    assert(jsonContent.evals.length === 1, "JSON report has 1 eval");
    assert(jsonContent.evals[0].cases[0].trials[0].criteria.length === 5, "JSON report has 5 criteria");

    info("Report content preview:");
    info(JSON.stringify(jsonContent.summary, null, 2));

    // ── Step 10: Write Markdown report ──────────────────────────

    header(10, "writeMarkdownReport()");

    const mdPath = await writeMarkdownReport(report, outputDir);
    kv("Markdown report", mdPath);

    const mdContent = await readFile(mdPath, "utf-8");
    assert(mdContent.includes("# Eval Report"), "Markdown has title");
    assert(mdContent.includes(spec.name), "Markdown includes spec name");
    assert(mdContent.includes("| Total cases |"), "Markdown has summary table");

    info(`Report length: ${mdContent.length} chars`);
    info("First 500 chars:");
    console.log(mdContent.slice(0, 500));

    // ── Step 11: History ────────────────────────────────────────

    header(11, "appendHistory() + loadHistory()");

    const perCriterionHistory: Record<string, { pass: boolean; score: number }> = {};
    for (const r of allResults) {
      perCriterionHistory[r.name] = { pass: r.pass, score: r.score };
    }

    const historyEntry = buildSpecHistoryEntry(
      spec.name, 1, trialPass ? 1 : 0, context.cost_usd, perCriterionHistory
    );

    await appendHistory(historyEntry, outputDir);
    const history = await loadHistory(outputDir);

    kv("History entries", history.length);
    kv("Latest entry timestamp", history[history.length - 1].timestamp);
    kv("Latest score", history[history.length - 1].summary.score);

    assert(history.length >= 1, "History has at least 1 entry");
    assert(history[history.length - 1].mode === "spec", "Latest entry is spec mode");

    // ── Step 12: Compare ────────────────────────────────────────

    header(12, "compareToLast()");

    if (history.length >= 2) {
      const comparison = compareToLast(historyEntry, history.slice(0, -1));
      if (comparison) {
        kv("Previous run", comparison.previous_timestamp);
        kv("Score delta", `${comparison.score_delta >= 0 ? "+" : ""}${(comparison.score_delta * 100).toFixed(0)}%`);
        kv("Regressions", comparison.regressions.length);
        kv("Improvements", comparison.improvements.length);
        kv("New criteria", comparison.new_criteria.length);
        kv("Removed criteria", comparison.removed_criteria.length);
      }
      assert(!!comparison, "Comparison produced");
    } else {
      info("Only 1 history entry — running again would produce a comparison.");
      info("Try running this test twice to see comparison output!");
      pass("No comparison needed for first run");
    }

    // ── Summary ─────────────────────────────────────────────────

    const totalDuration = Date.now() - startTime;

    console.log(`\n${BOLD}╔══════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║                     Results                          ║${RESET}`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════╝${RESET}`);
    console.log();
    kv("Total assertions", `${passedAssertions}/${totalAssertions} passed`);
    kv("Total duration", `${(totalDuration / 1000).toFixed(1)}s`);
    kv("Claude API cost", `$${context.cost_usd.toFixed(4)}`);
    kv("Eval result", trialPass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`);
    kv("Output directory", outputDir);
    console.log();
    kv("Artifacts produced", "");
    info(`  ${jsonPath}`);
    info(`  ${mdPath}`);
    info(`  ${join(trialOutputDir, "trial-1.jsonl")}`);
    info(`  ${join(outputDir, "history.jsonl")}`);
    console.log();

    if (passedAssertions === totalAssertions) {
      console.log(`${GREEN}${BOLD}All ${totalAssertions} assertions passed!${RESET}`);
    } else {
      console.log(`${RED}${BOLD}${totalAssertions - passedAssertions} assertion(s) failed.${RESET}`);
    }

    // Don't clean up — leave output for inspection
    console.log(`\n${DIM}Output preserved at: ${workDir}${RESET}`);
    console.log(`${DIM}To inspect: cat ${jsonPath} | jq .${RESET}`);
    console.log(`${DIM}To clean up: rm -rf ${workDir}${RESET}`);

    process.exit(passedAssertions === totalAssertions ? 0 : 1);

  } catch (error) {
    console.error(`\n${RED}${BOLD}Fatal error:${RESET}`, error);
    console.error(`\n${DIM}Work directory preserved at: ${workDir}${RESET}`);
    process.exit(2);
  }
}

main();
