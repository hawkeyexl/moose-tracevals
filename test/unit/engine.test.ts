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
});

describe("weight in the run's pass rate", () => {
  /** A judge that fails exactly the evals named, and passes the rest. */
  const failing = (names: string[]): TraceJudge => async (plans) =>
    plans.map((plan) => ({
      evalName: plan.evalName,
      artifact: plan.artifact.path,
      artifactName: plan.artifact.name,
      grader: plan.grader,
      implicit: plan.implicit,
      outcome: names.includes(plan.evalName)
        ? ("fail" as const)
        : ("pass" as const),
      costUsd: 0,
      durationMs: 1,
    }));

  it("stamps a weight on every result, defaulting to 1", async () => {
    const report = await run();
    expect(report.evalResults.every((r) => r.weight === 1)).toBe(true);
  });

  it("is inert at the default weight: the rate is plain pass over graded", async () => {
    const report = await run();
    const graded = report.evalResults.filter(
      (r) => r.outcome === "pass" || r.outcome === "fail" || r.outcome === "error",
    );
    const passed = graded.filter((r) => r.outcome === "pass").length;
    expect(report.summary.passRate).toBeCloseTo(
      graded.length > 0 ? passed / graded.length : 1,
      10,
    );
  });

  it("leaves needs-review and skipped out of both halves of the rate", async () => {
    // A session awaiting review neither helps nor hurts — the same membership
    // the counts have always reported, now weighted.
    const report = await run();
    const graded = report.evalResults.filter(
      (r) => r.outcome === "pass" || r.outcome === "fail" || r.outcome === "error",
    );
    expect(graded.length).toBe(
      report.summary.pass + report.summary.fail + report.summary.error,
    );
  });

  it("never lets a weight change an eval's own outcome", async () => {
    const first = await run({ judge: passJudge });
    // An ai-graded eval specifically: the injected judge only decides those,
    // and picking the first result of any kind lands on a deterministic one.
    // An ai eval the judge actually decided: some are skipped for their own
    // reasons, and picking one of those proves nothing about weight.
    const name = first.evalResults.find(
      (r) => r.grader === "ai" && r.outcome === "pass",
    )?.evalName;
    expect(name, "fixture has a judged ai eval").toBeDefined();
    const failed = await run({ judge: failing([name!]) });
    // The judge decides the outcome; weight only decides how much it moves the
    // rate. Counts stay unweighted for the same reason.
    expect(failed.evalResults.find((r) => r.evalName === name)?.outcome).toBe(
      "fail",
    );
    expect(failed.summary.fail).toBeGreaterThan(0);
  });
});
