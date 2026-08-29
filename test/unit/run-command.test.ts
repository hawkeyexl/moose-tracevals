/**
 * `runRun` is where CLI options meet the resolved config. The engine's own
 * `failOnNeedsReview` handling is covered in engine.test.ts; what is covered
 * here is the overlay — that `--fail-on-needs-review` actually reaches it.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runRun } from "../../src/commands/run.js";

const sessionFixture = fileURLToPath(
  new URL("../fixtures/traces/claude-session.jsonl", import.meta.url),
);
// One `human` eval and nothing else, so needs-review alone decides the exit.
const reviewOnly = fileURLToPath(
  new URL("../fixtures/review-only", import.meta.url),
);

function run(overrides: Record<string, unknown> = {}) {
  return runRun({
    tracePath: sessionFixture,
    project: reviewOnly,
    deterministicOnly: true,
    env: { MOOSE_TRACEVALS_HOME: reviewOnly },
    ...overrides,
  });
}

describe("runRun needs-review policy", () => {
  it("fails the run on needs-review by default", async () => {
    const { report } = await run();
    expect(report.summary.needsReview).toBe(1);
    expect(report.summary.fail + report.summary.error).toBe(0);
    expect(report.exitCode).toBe(1);
  });

  it("passes the run when the flag turns the policy off", async () => {
    const { report } = await run({ failOnNeedsReview: false });
    expect(report.summary.needsReview).toBe(1);
    expect(report.exitCode).toBe(0);
  });

  it("leaves the config value in force when the flag is absent", async () => {
    const { report } = await run({ failOnNeedsReview: undefined });
    expect(report.exitCode).toBe(1);
  });
});
