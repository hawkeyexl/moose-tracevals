/**
 * Integration tests against the built CLI (dist/cli.js) — what catches a
 * broken bin entry, a bad bundle, or a module that only resolves under
 * vitest. Requires `npm run build` first; CI builds before testing.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

const root = fileURLToPath(new URL("../..", import.meta.url));
const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const built = existsSync(cli);

async function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec("node", [cli, ...args], {
      cwd: root,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe.skipIf(!built)("built CLI", () => {
  it("deterministic-only run against the fixture corpus exits 1 with the engineered failure", async () => {
    const { code, stdout } = await runCli(
      [
        "run",
        "test/fixtures/traces/claude-session.jsonl",
        "--project",
        "test/fixtures/project",
        "--deterministic-only",
        "--format",
        "json",
      ],
      { MOOSE_TRACEVALS_HOME: "test/fixtures/home" },
    );
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    const find = (a: string, e: string) =>
      report.evalResults.find(
        (x: { artifact: string; evalName: string }) =>
          x.artifact.endsWith(a) && x.evalName === e,
      );
    expect(find("SKILL.md", "forbidden-tool")?.outcome).toBe("fail");
    expect(find("SKILL.md", "used-read")?.outcome).toBe("pass");
    expect(
      report.evalResults.filter(
        (x: { outcome: string }) => x.outcome === "skipped",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("mock-judge run produces consensus objects with zero network", async () => {
    const { code, stdout } = await runCli(
      [
        "run",
        "test/fixtures/traces/claude-session.jsonl",
        "--project",
        "test/fixtures/project",
        "--provider",
        "mock",
        "--no-cache",
        "--format",
        "json",
      ],
      { MOOSE_TRACEVALS_HOME: "test/fixtures/home" },
    );
    expect(code).toBe(1); // the deterministic failure persists
    const report = JSON.parse(stdout);
    const judged = report.evalResults.filter(
      (x: { consensus?: unknown }) => x.consensus,
    );
    expect(judged.length).toBeGreaterThan(0);
  });

  it("list --json enumerates the fixture session store", async () => {
    const { code, stdout } = await runCli(
      ["list", "--all-projects", "--json", "--limit", "5"],
      { MOOSE_TRACEVALS_HOME: "test/fixtures/home" },
    );
    expect(code).toBe(0);
    const { traces } = JSON.parse(stdout);
    expect(Array.isArray(traces)).toBe(true);
    expect(traces.length).toBeGreaterThan(0);
  });

  it("exits 2 with guidance when no trace is given off-TTY", async () => {
    const { code, stderr } = await runCli(["run"]);
    expect(code).toBe(2);
    expect(stderr).toContain("no trace given");
  });

  it("fill --dry-run reports proposals without touching the corpus", async () => {
    const { code, stdout } = await runCli(
      // --no-cache keeps this hermetic: without it the run writes into
      // <repo>/.moose-tracevals/cache/fill and a later run replays it.
      [
        "fill",
        "test/fixtures/project",
        "--provider",
        "mock",
        "--dry-run",
        "--no-cache",
        "--format",
        "json",
      ],
      { MOOSE_TRACEVALS_HOME: "test/fixtures/home" },
    );
    expect(code).toBe(0);
    const report = JSON.parse(stdout);

    const paths = report.results.map((r: { artifact: string }) =>
      r.artifact.replace(/\\/g, "/"),
    );
    expect(paths.some((p: string) => p.endsWith("fix-bug/SKILL.md"))).toBe(true);
    expect(paths.some((p: string) => p.endsWith("doc-writer.md"))).toBe(true);
    expect(paths.some((p: string) => p.endsWith("CLAUDE.md"))).toBe(true);
    // A plain doc is not an instruction artifact.
    expect(paths.some((p: string) => p.endsWith("README.md"))).toBe(false);

    expect(report.dryRun).toBe(true);
    // Project rules are proposed but never written, dry run or not.
    const rules = report.results.filter(
      (r: { type: string }) => r.type === "project-rules",
    );
    expect(rules.every((r: { status: string }) => r.status === "propose-only")).toBe(true);

    // Proves the gate ran rather than rubber-stamping the proposal.
    const reasons = report.results.flatMap((r: { rejected: { reason: string }[] }) =>
      r.rejected.map((x) => x.reason),
    );
    expect(reasons).toContain("low-confidence");
    expect(
      report.results.some(
        (r: { needsSharpening: unknown[] }) => r.needsSharpening.length > 0,
      ),
    ).toBe(true);
  });

  it("fill exits 2 for a path that does not exist", async () => {
    const { code, stderr } = await runCli(["fill", "does-not-exist-here"]);
    expect(code).toBe(2);
    expect(stderr).toContain("no such file or directory");
  });

  // The plugin path only really exists once it survives bundling: `dist/cli.js`
  // and `dist/index.js` are separate entries, and a side-effect plugin that
  // imports `moose-tracevals` is registering into whichever copy of the
  // registry that specifier resolves to. Only the built CLI can prove it is the
  // same one (ADR 01017).
  describe("grader plugins", () => {
    const pluginRun = (extra: string[]) => [
      "run",
      "test/fixtures/traces/claude-session.jsonl",
      "--project",
      "test/fixtures/plugin-project",
      "--deterministic-only",
      "--format",
      "json",
      ...extra,
    ];

    it("reports an unknown grader kind when no plugin is required", async () => {
      const { code, stdout } = await runCli(pluginRun([]), {
        MOOSE_TRACEVALS_HOME: "test/fixtures/plugin-project",
      });
      expect(code).toBe(1);
      const report = JSON.parse(stdout);
      const result = report.evalResults.find(
        (x: { evalName: string }) => x.evalName === "stayed-in-the-worktree",
      );
      expect(result.outcome).toBe("error");
      expect(result.error).toContain("unknown grader kind");
    });

    it("--require registers the kind and the same eval passes", async () => {
      const { code, stdout } = await runCli(
        pluginRun(["--require", "./test/fixtures/plugins/stayed-in-scope.mjs"]),
        { MOOSE_TRACEVALS_HOME: "test/fixtures/plugin-project" },
      );
      expect(code).toBe(0);
      const report = JSON.parse(stdout);
      const result = report.evalResults.find(
        (x: { evalName: string }) => x.evalName === "stayed-in-the-worktree",
      );
      expect(result.outcome).toBe("pass");
    });

    it("accepts a plugin that registers by importing the package itself", async () => {
      // The side-effect form the extend guide documents. It registers a kind
      // no eval declares, so the assertion is the absence of the
      // registered-nothing warning: the import reached the CLI's own registry.
      const { stdout } = await runCli(
        pluginRun([
          "--require",
          "./test/fixtures/plugins/side-effect-grader.mjs",
        ]),
        { MOOSE_TRACEVALS_HOME: "test/fixtures/plugin-project" },
      );
      const report = JSON.parse(stdout);
      expect(
        report.warnings.some((w: string) => /registered no grader kinds/.test(w)),
      ).toBe(false);
    });

    it("exits 2 with a message that is not the grader-not-found one", async () => {
      const { code, stderr } = await runCli(
        pluginRun(["--require", "./test/fixtures/plugins/does-not-exist.mjs"]),
        { MOOSE_TRACEVALS_HOME: "test/fixtures/plugin-project" },
      );
      expect(code).toBe(2);
      expect(stderr).toContain("could not load grader plugin");
      expect(stderr).not.toContain("unknown grader kind");
    });
  });

  // ADR 01018. The shape of the report is decided by *how* traces were
  // selected, not by how many came back, so a script piping `--format json`
  // gets something stable.
  describe("batch runs", () => {
    const home = { MOOSE_TRACEVALS_HOME: "test/fixtures/home" };
    const both = [
      "test/fixtures/traces/claude-session.jsonl",
      "test/fixtures/traces/claude-session-sidecar.jsonl",
    ];

    it("one named trace still emits a single-trace RunReport", async () => {
      const { stdout } = await runCli(
        [
          "run",
          both[0]!,
          "--project",
          "test/fixtures/project",
          "--deterministic-only",
          "--format",
          "json",
        ],
        home,
      );
      const report = JSON.parse(stdout);
      expect(report.trace).toBeDefined();
      expect(report.evalResults).toBeDefined();
      expect(report.traces).toBeUndefined();
    });

    it("two named traces emit an aggregate report and exit 1", async () => {
      const { code, stdout } = await runCli(
        [
          "run",
          ...both,
          "--project",
          "test/fixtures/project",
          "--deterministic-only",
          "--format",
          "json",
        ],
        home,
      );
      expect(code).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.summary.traces).toBe(2);
      expect(report.summary.tracesFailed).toBe(1);
      const forbidden = report.evals.find(
        (e: { evalName: string }) => e.evalName === "forbidden-tool",
      );
      expect(forbidden.passRate).toBe(0);
      expect(forbidden.failingTraces).toHaveLength(1);
    });

    it("a discovery selector emits an aggregate report even for one trace", async () => {
      const { code, stdout } = await runCli(
        [
          "run",
          "--all-projects",
          "--limit",
          "1",
          "--project",
          "test/fixtures/project",
          "--deterministic-only",
          "--format",
          "json",
        ],
        home,
      );
      expect(code).toBe(0);
      const report = JSON.parse(stdout);
      expect(report.summary.traces).toBe(1);
      expect(Array.isArray(report.evals)).toBe(true);
    });

    it("exits 2 rather than green when a selector matches nothing", async () => {
      const { code, stderr } = await runCli(
        ["run", "--all-projects", "--deterministic-only"],
        { MOOSE_TRACEVALS_HOME: "test/fixtures/project" },
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/no traces matched/);
    });

    it("exits 2 when named traces are mixed with a selector", async () => {
      const { code, stderr } = await runCli(
        ["run", both[0]!, "--limit", "1", "--deterministic-only"],
        home,
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/not both/);
    });

    it("rejects a --since that is not a duration", async () => {
      const { code, stderr } = await runCli(
        ["run", "--since", "yesterday", "--deterministic-only"],
        home,
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/--since must be a duration/);
    });
  });

  // ADR 01022. The command surface, the report shape, and the exit-code
  // contract, through the built binary rather than the library.
  describe("calibrate", () => {
    const home = { MOOSE_TRACEVALS_HOME: "test/fixtures/home" };
    const corpus = [
      "test/fixtures/traces/claude-session.jsonl",
      "test/fixtures/traces/claude-session-sidecar.jsonl",
    ];
    const base = [
      "calibrate",
      ...corpus,
      "--project",
      "test/fixtures/project",
      "--labels",
      "test/fixtures/project/tracevals/labels.yaml",
      "--provider",
      "mock",
      "--no-cache",
    ];

    it("measures the corpus and exits 0 despite disagreeing", async () => {
      const { code, stdout } = await runCli(
        [...base, "--format", "json"],
        home,
      );
      expect(code).toBe(0);
      const report = JSON.parse(stdout);
      expect(report.counts.falsePass).toBe(1);
      expect(report.counts.falseFail).toBe(1);
      expect(report.counts.reviewVolume).toBe(1);
      // A calibration report is its own shape, distinguishable without
      // inspecting the contents.
      expect(report.evalResults).toBeUndefined();
      expect(report.evals).toBeUndefined();
      expect(report.batch.summary.traces).toBe(2);
    });

    it("exits 1 only when a threshold is asked for and missed", async () => {
      const { code, stdout } = await runCli(
        [...base, "--max-false-pass", "0", "--format", "json"],
        home,
      );
      expect(code).toBe(1);
      expect(JSON.parse(stdout).gates[0]).toEqual({
        name: "falsePass",
        limit: 0,
        actual: 1,
        exceeded: true,
      });
    });

    it("sweeps every axis and names the setting that removes the false pass", async () => {
      const { code, stdout } = await runCli(
        [...base, "--sweep", "--format", "json"],
        home,
      );
      expect(code).toBe(0);
      const report = JSON.parse(stdout);
      const strict = report.sweep.find(
        (c: { axis: string; value: number }) =>
          c.axis === "zones.autoPass" && c.value === 0.95,
      );
      expect(strict.counts.falsePass).toBe(0);
      // The claim is the conversion, not the count: a stricter auto-pass floor
      // turns the false pass into a deferral, so review volume rises above the
      // baseline row. An absolute number here breaks whenever the fixture
      // corpus gains a judged eval.
      const baseline = report.sweep.find(
        (c: { axis: string }) => c.axis === "baseline",
      );
      expect(strict.counts.reviewVolume).toBeGreaterThan(
        baseline.counts.reviewVolume,
      );
    });

    it("exits 2 with the corpus listed when a label names a foreign trace", async () => {
      const { code, stderr } = await runCli(
        [
          "calibrate",
          corpus[0]!,
          "--project",
          "test/fixtures/project",
          "--labels",
          "test/fixtures/project/tracevals/labels.yaml",
          "--deterministic-only",
        ],
        home,
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/not in the corpus/);
      expect(stderr).toMatch(/claude-session-sidecar\.jsonl/);
    });

    it("exits 2 when the labels file does not exist", async () => {
      const { code, stderr } = await runCli(
        [...base, "--labels", "test/fixtures/project/tracevals/nope.yaml"],
        home,
      );
      expect(code).toBe(2);
      expect(stderr).toMatch(/could not read labels file/);
    });
  });

  it("legacy stream-json traces still parse", async () => {
    const { code, stdout } = await runCli(
      [
        "run",
        "test/fixtures/traces/claude-stream.jsonl",
        "--project",
        "test/fixtures/project",
        "--deterministic-only",
        "--format",
        "json",
      ],
      { MOOSE_TRACEVALS_HOME: "test/fixtures/home" },
    );
    const report = JSON.parse(stdout);
    expect(report.trace.source).toBe("claude-code");
    // The stream fixture invoked no skills; project rules still evaluate.
    expect([0, 1]).toContain(code);
  });
});
