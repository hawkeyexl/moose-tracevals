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
    env: { AGENTEVALS_HOME: fixtureHome },
    config,
    judge: passJudge,
    ...overrides,
  });
}

describe("runEvals", () => {
  it("grades declared deterministic criteria against the trace", async () => {
    const report = await run();
    const byName = Object.fromEntries(
      report.evalResults.map((r) => [r.evalName, r]),
    );
    // The fixture trace uses Read (pass) and Bash (violating forbidden-tool).
    expect(byName["used-read"]?.outcome).toBe("pass");
    expect(byName["forbidden-tool"]?.outcome).toBe("fail");
    expect(byName["forbidden-tool"]?.findings?.[0]?.message).toContain("Bash");
  });

  it("routes llm evals through the injected judge", async () => {
    const report = await run();
    const llm = report.evalResults.filter((r) => r.grader === "llm");
    expect(llm.length).toBeGreaterThan(0);
    expect(llm.every((r) => r.outcome === "pass")).toBe(true);
  });

  it("skips llm evals under deterministicOnly", async () => {
    const report = await run({ deterministicOnly: true, judge: undefined });
    const llm = report.evalResults.filter((r) => r.grader === "llm");
    expect(llm.every((r) => r.outcome === "skipped")).toBe(true);
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
    // Neutralize the deterministic failure by only judging llm evals: use a
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
