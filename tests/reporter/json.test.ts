import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonReport, writeTranscriptJsonReport } from "../../src/reporter/json.js";
import type { FullReport, TranscriptEvalReport } from "../../src/types.js";
import { tmpDir } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("writeJsonReport", () => {
  it("creates report.json with correct content", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const report: FullReport = {
      summary: {
        total_cases: 2,
        passed: 1,
        failed: 1,
        pass_rate: 0.5,
        total_cost_usd: 0.10,
        duration_ms: 5000,
      },
      evals: [],
    };
    const path = await writeJsonReport(report, tmp.dir);
    assert.ok(path.endsWith("report.json"));
    const content = JSON.parse(await readFile(path, "utf-8"));
    assert.equal(content.summary.total_cases, 2);
    assert.equal(content.summary.passed, 1);
  });
});

describe("writeTranscriptJsonReport", () => {
  it("creates timestamped + latest report.json", async () => {
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
    };
    const tsPath = await writeTranscriptJsonReport(report, tmp.dir);
    assert.ok(tsPath.includes("report-2026-01-15T10-30-00"));

    // Also check latest
    const latestPath = join(tmp.dir, "report.json");
    const latestContent = JSON.parse(await readFile(latestPath, "utf-8"));
    assert.equal(latestContent.summary.total, 3);
  });
});
