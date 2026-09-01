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
  summary: {
    total: 2,
    pass: 1,
    fail: 1,
    error: 0,
    needsReview: 0,
    skipped: 0,
    passRate: 0.5,
  },
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

  // Project rules resolve as one aggregated entry covering several files
  // (CLAUDE.md *and* AGENTS.md), so it is resolved with no single `path`. Every
  // reporter has to render that shape without inventing a location for it.
  describe("a resolved coverage entry with no single path", () => {
    const aggregated: RunReport = {
      ...report,
      coverage: [
        {
          ref: "project rules",
          kind: "project-rules",
          resolved: true,
          tried: ["C:\\work\\demo\\CLAUDE.md", "C:\\work\\demo\\AGENTS.md"],
        },
      ],
    };

    it("markdown renders an empty location, never the string undefined", () => {
      const out = render(aggregated, "markdown");
      expect(out).not.toContain("undefined");
      expect(out).toContain("| yes | project-rules | project rules |  |");
    });

    it("human renders an empty location, never the string undefined", () => {
      const out = render(aggregated, "human");
      expect(out).not.toContain("undefined");
    });

    // `ref` comes straight from the trace (a skill name or subagent_type), so a
    // pipe in it must not be able to break the table it is rendered into —
    // markdown reports get pasted into PR comments.
    it("escapes pipes so a coverage row keeps its column count", () => {
      const piped: RunReport = {
        ...aggregated,
        coverage: [
          {
            ref: "weird|name",
            kind: "skill",
            resolved: false,
            tried: [],
            note: "a | b",
          },
        ],
      };
      const out = render(piped, "markdown");
      const header = out.split("\n").find((l) => l.startsWith("| Resolved"))!;
      const row = out.split("\n").find((l) => l.includes("weird"))!;
      const cells = (line: string) => line.split(/(?<!\\)\|/).length - 2;
      expect(cells(row)).toBe(cells(header));
    });

    it("falls back to the note when one is present", () => {
      const withNote: RunReport = {
        ...aggregated,
        coverage: [{ ...aggregated.coverage[0]!, note: "several files" }],
      };
      expect(render(withNote, "markdown")).toContain(
        "| yes | project-rules | project rules | several files |",
      );
      expect(render(withNote, "human")).toContain("several files");
    });
  });
});
