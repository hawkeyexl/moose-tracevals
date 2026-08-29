/**
 * `runRun` is where CLI options meet the resolved config. The engine's own
 * `failOnNeedsReview` handling is covered in engine.test.ts; what is covered
 * here is the overlay — that `--fail-on-needs-review` and `--require` actually
 * reach it, and that the flag composes with the config rather than erasing it.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runRun } from "../../src/commands/run.js";
import { TracevalsError, type RunReport } from "../../src/types.js";

const sessionFixture = fileURLToPath(
  new URL("../fixtures/traces/claude-session.jsonl", import.meta.url),
);
// One `human` eval and nothing else, so needs-review alone decides the exit.
const reviewOnly = fileURLToPath(
  new URL("../fixtures/review-only", import.meta.url),
);
// One eval, graded by a kind only a plugin provides, so plugin loading alone
// decides between `pass` and `unknown grader kind`.
const pluginProject = fileURLToPath(
  new URL("../fixtures/plugin-project", import.meta.url),
);
const pluginsDir = fileURLToPath(
  new URL("../fixtures/plugins", import.meta.url),
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

describe("runRun grader plugins", () => {
  function runPlugins(overrides: Record<string, unknown> = {}) {
    return runRun({
      tracePath: sessionFixture,
      project: pluginProject,
      deterministicOnly: true,
      env: { MOOSE_TRACEVALS_HOME: pluginProject },
      ...overrides,
    });
  }

  const custom = (report: RunReport) =>
    report.evalResults.find((r) => r.evalName === "stayed-in-the-worktree");

  // Order is load-bearing in this block. A plugin loads once per process, so
  // the first two cases have to run against a registry that has not seen one
  // yet; vitest runs a file's tests in declaration order.

  it("errors on the custom kind when nothing loads the plugin", async () => {
    // The gap this exists to close. Without it there is no way to reach a
    // registered grader from the CLI at all.
    const { report } = await runPlugins({ configDir: reviewOnly });
    expect(custom(report)?.outcome).toBe("error");
    expect(custom(report)?.error).toMatch(/unknown grader kind/);
  });

  it("appends --require to the config list rather than replacing it", async () => {
    // Both halves in one call, and the assertion separates them: the eval is
    // graded by the *config's* plugin, and the warning comes from the flag's.
    // Were --require a replacement, this would be the `unknown grader kind`
    // error above — a one-off flag silently unregistering a repo's house
    // graders.
    const { report } = await runPlugins({
      configDir: pluginProject,
      require: [join(pluginsDir, "registers-nothing.mjs")],
    });
    expect(custom(report)?.outcome).toBe("pass");
    expect(
      report.warnings.some((w) => /registers-nothing\.mjs/.test(w)),
    ).toBe(true);
    expect(
      report.warnings.some((w) => /registered no grader kinds/.test(w)),
    ).toBe(true);
  });

  it("loads plugins named in the config, resolved against the config directory", async () => {
    // `plugins: [../plugins/stayed-in-scope.mjs]` is nonsense relative to the
    // cwd this suite runs in; it only resolves against the config's own dir.
    const { report } = await runPlugins({ configDir: pluginProject });
    expect(custom(report)?.outcome).toBe("pass");
    expect(report.exitCode).toBe(0);
  });

  it("fails the run operationally when a named plugin cannot be loaded", async () => {
    await expect(
      runPlugins({
        configDir: reviewOnly,
        require: ["./nope-not-here.mjs"],
      }),
    ).rejects.toThrow(TracevalsError);
  });
});
