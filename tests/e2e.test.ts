/**
 * End-to-end tests using real captured transcripts.
 *
 * These tests exercise the full pipeline:
 *   JSONL file → parseTranscriptFile → parseTranscriptContent → extractFromMessages
 *   then feed through graders, reporters, and history.
 *
 * Fixtures:
 *   tests/fixtures/real-transcript.jsonl       — simple "2+2" prompt, no tool use
 *   tests/fixtures/real-transcript-tools.jsonl  — prompt with tool use (Bash/Read)
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { parseTranscriptFile, parseTranscriptContent } from "../src/transcript-parser.js";
import { formatTranscriptForJudge } from "../src/judge.js";
import { runGrader, listGraders } from "../src/graders/index.js";
import { writeJsonReport } from "../src/reporter/json.js";
import { writeMarkdownReport } from "../src/reporter/markdown.js";
import { appendHistory, loadHistory, compareToLast, buildTranscriptHistoryEntry } from "../src/history.js";
import { discoverEvalSpecs } from "../src/discovery.js";
import { parseEvalSource } from "../src/parser.js";
import type { TrialContext, Criterion, TranscriptMessage, FullReport } from "../src/types.js";
import { tmpDir } from "./helpers.js";

const FIXTURE_DIR = new URL("./fixtures/", import.meta.url).pathname;
const SIMPLE_TRANSCRIPT = join(FIXTURE_DIR, "real-transcript.jsonl");

/**
 * Normalize raw JSONL messages into the flat TranscriptMessage format
 * that graders and formatTranscriptForJudge expect.
 * Mirrors runner.ts normalizeMessages (which is not exported).
 */
function normalizeMessages(messages: Record<string, unknown>[]): TranscriptMessage[] {
  const normalized: TranscriptMessage[] = [];
  for (const msg of messages) {
    const entry: TranscriptMessage = { type: msg.type as string };

    if (msg.type === "assistant") {
      entry.role = "assistant";
      const message = msg.message as Record<string, unknown> | undefined;
      if (message) {
        entry.content = message.content;
        if (Array.isArray(message.content)) {
          for (const block of message.content as Array<Record<string, unknown>>) {
            if (block?.type === "tool_use") {
              entry.tool_use = {
                id: block.id as string,
                name: block.name as string,
                input: block.input as Record<string, unknown>,
              };
            }
          }
        }
      }
    } else if (msg.type === "user") {
      entry.role = "user";
      const message = msg.message as Record<string, unknown> | undefined;
      if (message) entry.content = message.content;
    } else if (msg.type === "result") {
      entry.content = msg.subtype as string | undefined;
      (entry as Record<string, unknown>).num_turns = msg.num_turns;
      (entry as Record<string, unknown>).total_cost_usd = msg.total_cost_usd;
      (entry as Record<string, unknown>).is_error = msg.is_error;
    } else if (msg.type === "system") {
      entry.role = "system";
      if (msg.subtype !== undefined) {
        (entry as Record<string, unknown>).subtype = msg.subtype;
      }
    }

    normalized.push(entry);
  }
  return normalized;
}

/**
 * Build a TrialContext from a real parsed transcript,
 * normalizing messages for grader consumption.
 */
async function buildContextFromTranscript(transcriptPath: string): Promise<TrialContext> {
  const parsed = await parseTranscriptFile(transcriptPath);
  const messages = normalizeMessages(parsed.messages);
  return {
    transcript: messages,
    workspace_before: new Map(),
    workspace_after: new Map(),
    cwd: parsed.cwd,
    cost_usd: parsed.result?.total_cost_usd ?? 0,
    num_turns: parsed.result?.num_turns ?? 0,
    duration_ms: 0,
    extracted_criteria: {},
  };
}

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

// ── Full transcript parsing pipeline ──────────────────────────────

describe("e2e: transcript parsing", () => {
  it("parseTranscriptFile reads real JSONL and extracts metadata", async () => {
    const parsed = await parseTranscriptFile(SIMPLE_TRANSCRIPT);

    // System init was parsed
    assert.equal(parsed.cwd, "/mnt/c/Users/hawkeyexl/Documents/Workspaces/agent-tools/agent-evals");
    assert.equal(parsed.model, "claude-sonnet-4-6");
    assert.ok(parsed.declared_tools.length > 0, "should have declared tools");
    assert.ok(parsed.declared_tools.includes("Bash"));
    assert.ok(parsed.declared_tools.includes("Read"));

    // Result was parsed
    assert.ok(parsed.result, "should have result");
    assert.equal(parsed.result!.num_turns, 1);
    assert.equal(parsed.result!.is_error, false);
    assert.ok(parsed.result!.total_cost_usd > 0, "should have cost");
  });

  it("parseTranscriptContent produces same result from raw string", async () => {
    const raw = await readFile(SIMPLE_TRANSCRIPT, "utf-8");
    const parsed = parseTranscriptContent(raw);

    assert.equal(parsed.model, "claude-sonnet-4-6");
    assert.ok(parsed.result);
    assert.equal(parsed.result!.subtype, "success");
  });
});

// ── Transcript → judge formatting ─────────────────────────────────

describe("e2e: transcript → judge formatting", () => {
  it("formatTranscriptForJudge produces readable output from real transcript", async () => {
    const parsed = await parseTranscriptFile(SIMPLE_TRANSCRIPT);
    const messages = normalizeMessages(parsed.messages);
    const formatted = formatTranscriptForJudge(messages);

    // Should contain the assistant's response "4"
    assert.ok(formatted.includes("4"), "should contain the answer '4'");
    assert.ok(formatted.length > 0, "should not be empty");
  });
});

// ── Transcript → code graders ─────────────────────────────────────

describe("e2e: real transcript through code graders", () => {
  it("builds TrialContext from real transcript and runs graders", async () => {
    const ctx = await buildContextFromTranscript(SIMPLE_TRANSCRIPT);

    // turn-count: 1 turn, max 5 → pass
    const turnResult = await runGrader(
      { name: "turn-limit", type: "code", grader: "turn-count", config: { max_turns: 5 } },
      ctx, "claude-sonnet-4-6"
    );
    assert.equal(turnResult.pass, true);
    assert.equal(turnResult.grader, "turn-count");

    // cost-check: real cost < $1 → pass
    const costResult = await runGrader(
      { name: "budget", type: "code", grader: "cost-check", config: { max_cost_usd: 1.0 } },
      ctx, "claude-sonnet-4-6"
    );
    assert.equal(costResult.pass, true);

    // regex-match: transcript should contain "4"
    const regexResult = await runGrader(
      { name: "has-answer", type: "code", grader: "regex-match", config: { pattern: "4", expect: "present" } },
      ctx, "claude-sonnet-4-6"
    );
    assert.equal(regexResult.pass, true);

    // trigger-check: no skill was invoked → should_trigger=false passes
    const triggerResult = await runGrader(
      { name: "no-skill", type: "code", grader: "trigger-check", config: { skill_name: "nonexistent", should_trigger: false } },
      ctx, "claude-sonnet-4-6"
    );
    assert.equal(triggerResult.pass, true);
  });
});

// ── Full discovery → parse → validate pipeline ────────────────────

describe("e2e: discovery → parse pipeline", () => {
  it("discovers and parses the sample eval fixtures", async () => {
    // Discover from the tests/ directory
    const evalsDir = join(FIXTURE_DIR, "..", "evals");
    const sources = await discoverEvalSpecs(evalsDir);

    assert.ok(sources.length >= 1, "should find at least sample-triggering.yaml");
    assert.equal(sources[0].source, "standalone");

    // Parse the discovered spec
    const specs = await parseEvalSource(sources[0]);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].name, "sample-skill-triggering");
    assert.equal(specs[0].type, "capability");
    assert.equal(specs[0].cases.length, 2);
    assert.equal(specs[0].cases[0].criteria[0].grader, "trigger-check");
  });

  it("discovers frontmatter evals from sample-skill.md", async () => {
    const sources = await discoverEvalSpecs(join(FIXTURE_DIR, "sample-skill.md"));
    assert.equal(sources.length, 1);
    assert.equal(sources[0].source, "frontmatter");

    const specs = await parseEvalSource(sources[0]);
    assert.equal(specs.length, 2);
    assert.equal(specs[0].name, "sample-triggering");
    assert.equal(specs[1].name, "sample-output-quality");
  });
});

// ── Full report generation pipeline ───────────────────────────────

describe("e2e: report generation from real data", () => {
  it("generates JSON and Markdown reports from grader results", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;

    const ctx = await buildContextFromTranscript(SIMPLE_TRANSCRIPT);
    ctx.duration_ms = 29777;

    // Run several graders
    const criteria: Criterion[] = [
      { name: "turn-limit", type: "code", grader: "turn-count", config: { max_turns: 5 } },
      { name: "budget", type: "code", grader: "cost-check", config: { max_cost_usd: 1.0 } },
      { name: "has-answer", type: "code", grader: "regex-match", config: { pattern: "4", expect: "present" } },
    ];

    const results = await Promise.all(
      criteria.map((c) => runGrader(c, ctx, "claude-sonnet-4-6"))
    );

    const allPass = results.every((r) => r.pass);
    assert.equal(allPass, true, "all graders should pass on this simple transcript");

    // Build a FullReport
    const report: FullReport = {
      summary: {
        total_cases: 1,
        passed: allPass ? 1 : 0,
        failed: allPass ? 0 : 1,
        pass_rate: allPass ? 1.0 : 0.0,
        total_cost_usd: ctx.cost_usd,
        duration_ms: ctx.duration_ms,
      },
      evals: [{
        name: "e2e-test",
        artifact: { type: "skill", path: "tests/fixtures/sample-skill.md" },
        type: "capability",
        cases: [{
          name: "simple-math",
          trials: [{
            trial_number: 1,
            criteria: results,
            pass: allPass,
            transcript_path: SIMPLE_TRANSCRIPT,
            cost_usd: ctx.cost_usd,
            duration_ms: ctx.duration_ms,
            num_turns: ctx.num_turns,
          }],
          pass_at_k: allPass,
          pass_pow_k: allPass,
          per_criterion_pass_rate: Object.fromEntries(results.map((r) => [r.name, r.pass ? 1.0 : 0.0])),
        }],
      }],
    };

    // Write JSON report
    const jsonPath = await writeJsonReport(report, tmp.dir);
    const jsonContent = JSON.parse(await readFile(jsonPath, "utf-8"));
    assert.equal(jsonContent.summary.total_cases, 1);
    assert.equal(jsonContent.summary.passed, 1);
    assert.equal(jsonContent.evals[0].name, "e2e-test");
    assert.equal(jsonContent.evals[0].cases[0].trials[0].criteria.length, 3);

    // Write Markdown report
    const mdPath = await writeMarkdownReport(report, tmp.dir);
    const mdContent = await readFile(mdPath, "utf-8");
    assert.ok(mdContent.includes("# Eval Report"));
    assert.ok(mdContent.includes("e2e-test"));
    assert.ok(mdContent.includes("simple-math"));
  });
});

// ── History round-trip with real data ─────────────────────────────

describe("e2e: history tracking with real transcript data", () => {
  it("appends, loads, and compares history entries from real runs", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;

    const parsed = await parseTranscriptFile(SIMPLE_TRANSCRIPT);

    // Simulate two runs with different scores
    const entry1 = buildTranscriptHistoryEntry(
      "transcript", SIMPLE_TRANSCRIPT,
      3, 2, 0.67, parsed.result?.total_cost_usd ?? 0,
      {
        "turn-limit": { pass: true, score: 1.0 },
        "budget": { pass: true, score: 1.0 },
        "has-answer": { pass: false, score: 0.0 },
      }
    );

    const entry2 = buildTranscriptHistoryEntry(
      "transcript", SIMPLE_TRANSCRIPT,
      3, 3, 1.0, parsed.result?.total_cost_usd ?? 0,
      {
        "turn-limit": { pass: true, score: 1.0 },
        "budget": { pass: true, score: 1.0 },
        "has-answer": { pass: true, score: 1.0 },
      }
    );

    await appendHistory(entry1, tmp.dir);
    await appendHistory(entry2, tmp.dir);

    const history = await loadHistory(tmp.dir);
    assert.equal(history.length, 2);

    const comparison = compareToLast(entry2, [entry1]);
    assert.ok(comparison);
    assert.ok(comparison!.improvements.length >= 1, "should detect has-answer improvement");
    assert.equal(comparison!.improvements[0].criterion, "has-answer");
    assert.ok(comparison!.score_delta > 0, "score should improve");
  });
});

// ── Composite grader with real context ────────────────────────────

describe("e2e: composite grader on real transcript", () => {
  it("all-of composite with real data passes when all sub-criteria pass", async () => {
    const ctx = await buildContextFromTranscript(SIMPLE_TRANSCRIPT);

    const result = await runGrader(
      {
        name: "all-checks",
        type: "composite",
        grader: "all-of",
        sub_criteria: [
          { name: "turns-ok", type: "code", grader: "turn-count", config: { max_turns: 10 } },
          { name: "cost-ok", type: "code", grader: "cost-check", config: { max_cost_usd: 1.0 } },
        ],
      },
      ctx, "claude-sonnet-4-6"
    );

    assert.equal(result.pass, true);
    assert.equal(result.grader, "all-of");
    assert.ok(result.evidence);
    const subResults = (result.evidence as Record<string, unknown>).sub_results as Array<{ name: string; pass: boolean }>;
    assert.equal(subResults.length, 2);
    assert.ok(subResults.every((s) => s.pass));
  });
});
