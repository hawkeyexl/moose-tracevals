import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runEvals } from "../../src/core/engine.js";
import { parseConfig } from "../../src/core/config.js";
import type { TraceJudge } from "../../src/judge/trace-judge.js";

const sessionFixture = fileURLToPath(
  new URL("../fixtures/traces/claude-session.jsonl", import.meta.url),
);
const fixtureProject = fileURLToPath(
  new URL("../fixtures/project", import.meta.url),
);
const fixtureHome = fileURLToPath(
  new URL("../fixtures/home", import.meta.url),
);

const config = parseConfig({});

const passJudge: TraceJudge = async (plans) =>
  plans.map((plan) => ({
    evalName: plan.evalName,
    artifact: plan.artifact.path,
    artifactName: plan.artifact.name,
    grader: plan.grader,
    implicit: plan.implicit,
    outcome: "pass" as const,
    costUsd: 0,
    durationMs: 1,
  }));

function run(overrides: Record<string, unknown> = {}) {
  return runEvals({
    tracePath: sessionFixture,
    projectDir: fixtureProject,
    env: { MOOSE_TRACEVALS_HOME: fixtureHome },
    config,
    judge: passJudge,
    ...overrides,
  });
}

describe("runEvals", () => {
  it("grades declared deterministic evals against the trace", async () => {
    const report = await run();
    const byName = Object.fromEntries(
      report.evalResults.map((r) => [r.evalName, r]),
    );
    // The fixture trace uses Read (pass) and Bash (violating forbidden-tool).
    expect(byName["used-read"]?.outcome).toBe("pass");
    expect(byName["forbidden-tool"]?.outcome).toBe("fail");
    expect(byName["forbidden-tool"]?.findings?.[0]?.message).toContain("Bash");
  });

  it("routes ai evals through the injected judge", async () => {
    const report = await run();
    // An artifact carrying `metadata.eval-skip` also plans under the `ai`
    // grader, so exclude the skipped placeholder: what this pins is that the
    // evals actually handed to the judge come back with its verdict.
    const judged = report.evalResults.filter(
      (r) => r.grader === "ai" && r.outcome !== "skipped",
    );
    expect(judged.length).toBeGreaterThan(0);
    expect(judged.every((r) => r.outcome === "pass")).toBe(true);
  });

  it("skips ai evals under deterministicOnly", async () => {
    const report = await run({ deterministicOnly: true, judge: undefined });
    const ai = report.evalResults.filter((r) => r.grader === "ai");
    expect(ai.every((r) => r.outcome === "skipped")).toBe(true);
  });

  it("exits 1 when any eval fails", async () => {
    const report = await run();
    expect(report.exitCode).toBe(1);
    expect(report.summary.fail).toBeGreaterThan(0);
  });

  it("carries coverage and warnings into the report", async () => {
    const report = await run();
    expect(report.coverage.some((c) => c.ref === "Explore")).toBe(true);
    expect(report.warnings.some((w) => w.includes("unparseable"))).toBe(true);
  });

  it("treats an explicit projectDir as the walk ceiling", async () => {
    const report = await run();
    // Only the fixture project's rules, not this repo's own CLAUDE.md.
    const rules = report.evalResults.filter(
      (r) => r.artifactType === "project-rules",
    );
    for (const rule of rules) {
      expect(rule.artifact).toContain("fixtures");
    }
  });

  it("respects failOnNeedsReview", async () => {
    const reviewJudge: TraceJudge = async (plans) =>
      plans.map((plan) => ({
        evalName: plan.evalName,
        artifact: plan.artifact.path,
        artifactName: plan.artifact.name,
        grader: plan.grader,
        implicit: plan.implicit,
        outcome: "needs-review" as const,
        costUsd: 0,
        durationMs: 1,
      }));
    // Neutralize the deterministic failure by only judging ai evals: use a
    // config that fails on needs-review (default) vs one that does not.
    const strict = await run({ judge: reviewJudge });
    expect(strict.summary.needsReview).toBeGreaterThan(0);
    expect(strict.exitCode).toBe(1);

    const lax = await run({
      judge: reviewJudge,
      config: parseConfig({ failOnNeedsReview: false }),
    });
    // Deterministic forbidden-tool still fails, so isolate: needs-review alone
    // must not force failure — check summary accounting instead.
    expect(lax.summary.needsReview).toBeGreaterThan(0);
  });
  it("never hands the judge an eval whose window is empty", async () => {
    // `doc-writer` is spawned by the fixture trace but records no branch, so
    // the agent governed nothing. A passing judge would otherwise turn that
    // into a confident pass over the parent session's work.
    const report = await run();
    const docWriter = report.evalResults.filter((r) =>
      r.artifactName === "doc-writer",
    );
    expect(docWriter.length).toBeGreaterThan(0);
    for (const result of docWriter) {
      expect(result.outcome).toBe("skipped");
      expect(result.skipReason).toContain("no subagent turns");
    }
  });

  it("grades an agent artifact against its own branch", async () => {
    const report = await run();
    const byName = Object.fromEntries(
      report.evalResults.map((r) => [r.evalName, r]),
    );
    // The parent session ran Edit; the reviewer branch only read. Without
    // windowing this is a fail.
    expect(byName["reviewer-is-read-only"]?.outcome).toBe("pass");
    expect(byName["reviewer-read-something"]?.outcome).toBe("pass");
  });

  it("counts only in-window tool calls against a skill's eval", async () => {
    const report = await run();
    const forbidden = report.evalResults.find(
      (r) => r.evalName === "forbidden-tool",
    );
    // Two Bash calls in the session; one before the skill was invoked.
    expect(forbidden?.outcome).toBe("fail");
    expect(forbidden?.findings?.[0]?.message).toContain("used 1 time(s)");
  });
});
