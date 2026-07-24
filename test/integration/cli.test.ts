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
      { AGENTEVALS_HOME: "test/fixtures/home" },
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
      { AGENTEVALS_HOME: "test/fixtures/home" },
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
      { AGENTEVALS_HOME: "test/fixtures/home" },
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
      // <repo>/.agentevals/cache/fill and a later run replays it.
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
      { AGENTEVALS_HOME: "test/fixtures/home" },
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
      { AGENTEVALS_HOME: "test/fixtures/home" },
    );
    const report = JSON.parse(stdout);
    expect(report.trace.source).toBe("claude-code");
    // The stream fixture invoked no skills; project rules still evaluate.
    expect([0, 1]).toContain(code);
  });
});
