import { describe, expect, it } from "vitest";
import { render } from "../../src/reporters/index.js";
import type { RunReport } from "../../src/types.js";

const report: RunReport = {
  trace: {
    file: "C:\\traces\\session.jsonl",
    source: "claude-code",
    sessionId: "abc",
    cwd: "C:\\work\\demo-project",
    model: "claude-opus-4-8",
    turnCount: 2,
  },
  warnings: ["1 unparseable JSONL line(s) were skipped"],
  coverage: [
    {
      ref: "fix-bug",
      kind: "skill",
      resolved: true,
      path: "C:\\work\\demo\\SKILL.md",
      tried: [],
    },
    {
      ref: "ghost",
      kind: "skill",
      resolved: false,
      tried: ["a", "b"],
    },
  ],
  evalResults: [
    {
      evalName: "forbidden-tool",
      artifact: "C:\\work\\demo\\SKILL.md",
      artifactName: "fix-bug",
      artifactType: "skill",
      grader: "tool-usage",
      implicit: false,
      outcome: "fail",
      findings: [
        {
          evalName: "forbidden-tool",
          artifact: "C:\\work\\demo\\SKILL.md",
          message: "tool Bash was used 1 time(s) but must not be",
          severity: "error",
        },
      ],
      durationMs: 2,
    },
    {
      evalName: "adheres-to-artifact",
      artifact: "C:\\work\\demo\\CLAUDE.md",
      artifactName: "CLAUDE.md",
      artifactType: "project-rules",
      grader: "llm",
      implicit: true,
      outcome: "pass",
      durationMs: 5,
      costUsd: 0.01,
    },
  ],
  summary: { total: 2, pass: 1, fail: 1, error: 0, needsReview: 0, skipped: 0 },
  exitCode: 1,
  costUsd: 0.01,
  durationMs: 100,
};

describe("reporters", () => {
  it("json round-trips the report", () => {
    const out = render(report, "json");
    const parsed = JSON.parse(out) as RunReport;
    expect(parsed.summary.fail).toBe(1);
    expect(parsed.evalResults).toHaveLength(2);
  });

  it("human output shows outcomes, findings, coverage, and warnings", () => {
    const out = render(report, "human");
    expect(out).toContain("FAIL");
    expect(out).toContain("forbidden-tool");
    expect(out).toContain("Bash");
    expect(out).toContain("ghost");
    expect(out).toContain("unparseable");
    expect(out).toContain("(implicit)");
  });

  it("markdown output includes eval and coverage tables", () => {
    const out = render(report, "markdown");
    expect(out).toContain("| Outcome | Artifact | Eval | Grader | Detail |");
    expect(out).toContain("| fail | fix-bug |");
    expect(out).toContain("## Artifact coverage");
    expect(out).toContain("**2 eval(s)**");
  });
});
