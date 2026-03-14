import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeMarkdownReport, writeTranscriptMarkdownReport } from "../../src/reporter/markdown.js";
import type { FullReport, TranscriptEvalReport } from "../../src/types.js";
import { tmpDir } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("writeMarkdownReport", () => {
  it("creates report.md with summary table", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const report: FullReport = {
      summary: {
        total_cases: 5,
        passed: 3,
        failed: 2,
        pass_rate: 0.6,
        total_cost_usd: 0.50,
        duration_ms: 10000,
      },
      evals: [
        {
          name: "test-eval",
          artifact: { type: "skill", path: "./skill.md" },
          type: "capability",
          cases: [
            {
              name: "case-1",
              trials: [],
              pass_at_k: true,
              pass_pow_k: true,
              per_criterion_pass_rate: { "check-a": 1.0 },
            },
          ],
        },
      ],
    };
    const path = await writeMarkdownReport(report, tmp.dir);
    const content = await readFile(path, "utf-8");
    assert.ok(content.includes("# Eval Report"));
    assert.ok(content.includes("| Total cases | 5 |"));
    assert.ok(content.includes("| Passed | 3 |"));
    assert.ok(content.includes("test-eval"));
  });
});

describe("writeTranscriptMarkdownReport", () => {
  it("creates report.md with session summary", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const report: TranscriptEvalReport = {
      timestamp: "2026-01-15T10:30:00.000Z",
      source: { type: "transcript", value: "test.jsonl" },
      transcript_summary: {
        cwd: "/tmp",
        model: "claude-sonnet-4-6",
        num_turns: 5,
        cost_usd: 0.02,
        status: "success",
        skills: ["my-skill"],
        agents: [],
      },
      artifacts: [],
      judgments: [],
      criteria_quality: [],
      summary: {
        total: 3,
        passed: 2,
        failed: 1,
        score: 0.67,
        pass: false,
        mean_clarity: 0.8,
        mean_assessability: 0.9,
        judge_cost_usd: 0.01,
      },
    };
    const path = await writeTranscriptMarkdownReport(report, tmp.dir);
    const content = await readFile(path, "utf-8");
    assert.ok(content.includes("# Transcript Eval Report"));
    assert.ok(content.includes("## Session Summary"));
    assert.ok(content.includes("claude-sonnet-4-6"));
  });

  it("comparison section included when comparison exists", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const report: TranscriptEvalReport = {
      timestamp: "2026-01-15T10:30:00.000Z",
      source: { type: "transcript", value: "test.jsonl" },
      transcript_summary: {
        cwd: "/tmp",
        model: "claude-sonnet-4-6",
        num_turns: 5,
        cost_usd: 0.02,
        status: "success",
        skills: [],
        agents: [],
      },
      artifacts: [],
      judgments: [],
      criteria_quality: [],
      summary: {
        total: 3,
        passed: 2,
        failed: 1,
        score: 0.67,
        pass: false,
        mean_clarity: 0.8,
        mean_assessability: 0.9,
        judge_cost_usd: 0.01,
      },
      comparison: {
        previous_timestamp: "2026-01-14T10:00:00.000Z",
        regressions: [{ criterion: "check-a", was: 1.0, now: 0.3 }],
        improvements: [],
        new_criteria: [],
        removed_criteria: [],
        score_delta: -0.2,
      },
    };
    const path = await writeTranscriptMarkdownReport(report, tmp.dir);
    const content = await readFile(path, "utf-8");
    assert.ok(content.includes("## Comparison"));
    assert.ok(content.includes("Regressions"));
    assert.ok(content.includes("check-a"));
  });
});
