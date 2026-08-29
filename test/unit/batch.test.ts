/**
 * Batch runs (ADR 01018). Adherence is a rate across sessions, not one verdict,
 * so `run` takes many traces and reports per-artifact and per-eval rates.
 *
 * The load-bearing assertions here are the two that cost real money or real
 * evidence if they regress: the judge cost budget spans the whole batch, and a
 * trace that cannot be parsed degrades to one entry instead of losing the rest.
 */
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockProvider, mockVerdict } from "@hawkeyexl/inference";
import { runBatch, parseSince } from "../../src/commands/batch.js";
import { makeTraceJudge } from "../../src/judge/trace-judge.js";
import { TracevalsError } from "../../src/types.js";

const fixture = (rel: string) =>
  fileURLToPath(new URL(`../fixtures/${rel}`, import.meta.url));

const traceA = fixture("traces/claude-session.jsonl");
const traceB = fixture("traces/claude-session-sidecar.jsonl");
const project = fixture("project");
const home = fixture("home");

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await mkdtemp(join(".tmp", "batch-"));
});
afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function batch(overrides: Record<string, unknown> = {}) {
  return runBatch({
    traces: [traceA, traceB],
    project,
    deterministicOnly: true,
    env: { MOOSE_TRACEVALS_HOME: home },
    ...overrides,
  });
}

describe("parseSince", () => {
  it("accepts minutes, hours, days, and weeks", () => {
    expect(parseSince("30m")).toBe(30 * 60_000);
    expect(parseSince("24h")).toBe(24 * 60 * 60_000);
    expect(parseSince("7d")).toBe(7 * 24 * 60 * 60_000);
    expect(parseSince("2w")).toBe(14 * 24 * 60 * 60_000);
  });

  it("rejects anything else as an operational error", () => {
    for (const bad of ["", "7", "d", "-1d", "7y", "1.5.2d", "seven days"]) {
      expect(() => parseSince(bad)).toThrow(TracevalsError);
    }
  });
});

describe("runBatch", () => {
  it("evaluates every trace and reports one entry each, in the given order", async () => {
    const { report } = await batch();
    expect(report.traces).toHaveLength(2);
    expect(report.traces[0]?.file).toBe(traceA);
    expect(report.traces[1]?.file).toBe(traceB);
    expect(report.summary.traces).toBe(2);
  });

  it("aggregates per-eval rates across traces", async () => {
    const { report } = await batch();
    // The fixture skill declares a tool-usage eval the first trace violates.
    const forbidden = report.evals.find((e) => e.evalName === "forbidden-tool");
    expect(forbidden).toBeDefined();
    expect(forbidden?.failingTraces).toContain(traceA);
    // A rate, not a verdict: skipped results are excluded from the denominator
    // because a check that never armed is not evidence either way.
    expect(forbidden?.passRate).not.toBeNull();
    expect(forbidden?.counts.fail).toBeGreaterThan(0);

    const passing = report.evals.find((e) => e.evalName === "used-read");
    expect(passing?.counts.pass).toBeGreaterThan(0);
    expect(passing?.failingTraces).toEqual([]);
  });

  it("aggregates per-artifact rows too", async () => {
    const { report } = await batch();
    const skill = report.artifacts.find((a) => a.artifactName === "fix-bug");
    expect(skill).toBeDefined();
    expect(skill?.artifactType).toBe("skill");
    // Only the traces that actually resolved it. The `fix-bug` skill is
    // invoked in the first fixture trace and not the second, so a row claiming
    // two would be counting a session the artifact had no part in.
    expect(skill?.traces).toBe(1);

    // Project rules resolve for every session, so that row spans the batch.
    const rules = report.artifacts.find(
      (a) => a.artifactType === "project-rules",
    );
    expect(rules?.traces).toBe(2);

    // The artifact row is the sum of its eval rows.
    const evalRows = report.evals.filter((e) => e.artifactName === "fix-bug");
    const summed = evalRows.reduce((n, e) => n + e.total, 0);
    expect(skill?.total).toBe(summed);
  });

  it("orders aggregate rows deterministically", async () => {
    const first = await batch();
    const second = await batch();
    expect(second.report.evals.map((e) => e.key)).toEqual(
      first.report.evals.map((e) => e.key),
    );
    const keys = first.report.evals.map((e) => e.key);
    expect([...keys].sort()).toEqual(keys);
  });

  it("exits 1 when any trace fails, and 0 when none do", async () => {
    const { report } = await batch();
    expect(report.exitCode).toBe(1);
    expect(report.summary.tracesFailed).toBeGreaterThan(0);

    // The sidecar fixture alone passes (CI asserts exit 0 for it).
    const clean = await batch({ traces: [traceB] });
    expect(clean.report.exitCode).toBe(0);
    expect(clean.report.summary.tracesFailed).toBe(0);
  });

  it("degrades an unparseable trace to one entry and keeps going", async () => {
    const bad = join(tmpDir, "not-a-trace.jsonl");
    await writeFile(bad, "this is not JSONL at all\n", "utf-8");

    const { report } = await batch({ traces: [bad, traceA, traceB] });
    expect(report.traces).toHaveLength(3);
    const failed = report.traces.find((t) => t.file === bad);
    expect(failed?.error).toBeTruthy();
    expect(failed?.exitCode).toBe(1);
    expect(report.summary.tracesErrored).toBe(1);
    // The other two still produced verdicts — one bad file in a corpus of 50
    // must not cost the other 49.
    expect(report.evals.some((e) => e.evalName === "forbidden-tool")).toBe(true);
    expect(report.exitCode).toBe(1);
  });

  it("refuses a selector that matched no traces rather than passing green", async () => {
    // A gate that silently passes because nothing matched is the false green
    // this tool exists to avoid, so it is operational (exit 2), not exit 0.
    await expect(
      runBatch({
        allProjects: true,
        project,
        deterministicOnly: true,
        env: { MOOSE_TRACEVALS_HOME: join(tmpDir, "empty-home") },
      }),
    ).rejects.toThrow(TracevalsError);
  });

  it("rejects mixing named traces with a discovery selector", async () => {
    await expect(batch({ limit: 1 })).rejects.toThrow(TracevalsError);
  });

  describe("the judge cost budget", () => {
    // The single most important thing in this phase. `maxCostUsd` was enforced
    // inside one judge instance per run; a batch that built a fresh judge per
    // trace would silently bill N times the configured cap.
    const priced = () => ({
      ...mockVerdict("pass", 0.95),
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
    });

    it("spans the whole batch, not each trace", async () => {
      const { report } = await runBatch({
        traces: [traceA, traceB],
        project,
        env: { MOOSE_TRACEVALS_HOME: home },
        judge: makeTraceJudge({
          provider: new MockProvider(Array.from({ length: 40 }, priced)),
          runs: 1,
          noCache: true,
          // Enough for exactly one judged eval at $1 apiece.
          maxCostUsd: 1,
          pricing: { inputPerMTok: 1, outputPerMTok: 0 },
        }),
      });

      const judged = report.traces.reduce((n, t) => n + t.costUsd, 0);
      expect(judged).toBeCloseTo(1, 5);

      // And the exhausted budget is *reported*, with the reason naming it —
      // never a silent pass and never a silent absence.
      const budgetSkips = report.evals.filter((e) =>
        e.skipReasons.some((r) => /budget/.test(r)),
      );
      expect(budgetSkips.length).toBeGreaterThan(0);
    });

    it("reuses one judge across traces", async () => {
      const calls: number[] = [];
      await runBatch({
        traces: [traceA, traceB],
        project,
        env: { MOOSE_TRACEVALS_HOME: home },
        judge: async (plans) => {
          calls.push(plans.length);
          return plans.map((p) => ({
            evalName: p.evalName,
            artifact: p.artifact.path,
            artifactName: p.artifact.name,
            grader: p.grader,
            implicit: p.implicit,
            outcome: "pass" as const,
            costUsd: 0,
            durationMs: 0,
          }));
        },
      });
      // Once per trace that had judged evals — one instance, many calls.
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("--history", () => {
    it("appends one entry per trace", async () => {
      const historyDir = await mkdtemp(join(".tmp", "batch-history-"));
      try {
        await batch({ history: true, configDir: historyDir });
        const { loadHistory } = await import("../../src/history.js");
        const entries = await loadHistory(
          join(historyDir, ".moose-tracevals", "history.jsonl"),
        );
        expect(entries).toHaveLength(2);
        expect(entries.map((e) => e.traceFile).sort()).toEqual(
          [traceA, traceB].sort(),
        );
      } finally {
        await rm(historyDir, { recursive: true, force: true });
      }
    });
  });
});
