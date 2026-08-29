import { describe, expect, it } from "vitest";
import { render, renderBatch } from "../../src/reporters/index.js";
import { aggregate } from "../../src/aggregate.js";
import type { BatchReport, RunReport } from "../../src/types.js";

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
  availability: {
    recorded: true,
    skills: { offered: 4, used: 1, unused: 3 },
    agents: { offered: 2, used: 0, unused: 2 },
    listed: false,
  },
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
      expect(out).toContain("| yes | project-rules | project rules |  |  |");
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

    it("keeps the availability column when the ref carries a pipe", () => {
      const piped: RunReport = {
        ...aggregated,
        coverage: [
          {
            ref: "weird|name",
            kind: "skill",
            resolved: false,
            tried: [],
            availability: "not-offered",
          },
        ],
      };
      expect(render(piped, "markdown")).toContain("not-offered");
    });

    it("falls back to the note when one is present", () => {
      const withNote: RunReport = {
        ...aggregated,
        coverage: [{ ...aggregated.coverage[0]!, note: "several files" }],
      };
      expect(render(withNote, "markdown")).toContain(
        "| yes | project-rules | project rules |  | several files |",
      );
      expect(render(withNote, "human")).toContain("several files");
    });
  });

  // Offered, offered-but-unused, and not-offered are three different problems
  // (ADR 01016), and collapsing any pair sends a reader to the wrong place.
  describe("availability", () => {
    it("summarises the roster without listing it", () => {
      const out = render(report, "human");
      expect(out).toContain("4 skill(s) offered, 1 used, 3 never used");
      expect(out).toContain("2 agent(s) offered, 0 used, 2 never used");
      expect(out).toContain("--report-unused-artifacts");
    });

    it("markdown carries the same summary", () => {
      const out = render(report, "markdown");
      expect(out).toContain("## Availability");
      expect(out).toContain("4 skill(s) offered, 1 used, 3 never used");
    });

    it("says unknown rather than zero when no roster was recorded", () => {
      const none: RunReport = {
        ...report,
        availability: {
          recorded: false,
          skills: { offered: 0, used: 0, unused: 0 },
          agents: { offered: 0, used: 0, unused: 0 },
          listed: false,
        },
      };
      for (const format of ["human", "markdown"] as const) {
        const out = render(none, format);
        expect(out).toContain("unknown");
        expect(out).not.toContain("0 skill(s) offered");
      }
    });

    it("flags a referenced artifact that was never on the menu", () => {
      const missing: RunReport = {
        ...report,
        coverage: [
          { ref: "ghost", kind: "skill", resolved: false, tried: [], availability: "not-offered" },
        ],
      };
      expect(render(missing, "human")).toContain("not offered");
      expect(render(missing, "markdown")).toContain("not-offered");
    });

    it("never claims an unused artifact was not found", () => {
      // Nothing was looked for on disk, so "not found (0 locations tried)"
      // would be a claim about a search that never ran.
      const unused: RunReport = {
        ...report,
        availability: { ...report.availability, listed: true },
        coverage: [
          {
            ref: "deep-research",
            kind: "skill",
            resolved: false,
            tried: [],
            note: "offered, never used — Fan-out web searches.",
            availability: "offered-not-used",
          },
        ],
      };
      const human = render(unused, "human");
      expect(human).toContain("offered, never used — Fan-out web searches.");
      expect(human).not.toContain("not found");
      expect(human).not.toContain("--report-unused-artifacts");
      const markdown = render(unused, "markdown");
      expect(markdown).toContain("| n/a | skill | deep-research |");
      expect(markdown).not.toContain("not found");
    });
  });
});

/**
 * The aggregate rendering (ADR 01018). Built from two runs of the same report
 * with the second one's `forbidden-tool` passing, so every row has a rate
 * strictly between 0 and 1 — the case a reporter that only prints counts would
 * render identically to any other.
 */
describe("batch reporters", () => {
  const passing: RunReport = {
    ...report,
    trace: { ...report.trace, file: "C:\\traces\\second.jsonl", sessionId: "def" },
    evalResults: [
      { ...report.evalResults[0]!, outcome: "pass", findings: [] },
      report.evalResults[1]!,
    ],
    summary: { total: 2, pass: 2, fail: 0, error: 0, needsReview: 0, skipped: 0 },
    exitCode: 0,
  };

  const batch: BatchReport = aggregate(
    [
      { file: "C:\\traces\\session.jsonl", report },
      { file: "C:\\traces\\second.jsonl", report: passing },
      { file: "C:\\traces\\broken.jsonl", error: "not JSONL", durationMs: 1 },
    ],
    { durationMs: 10 },
  );

  it("computes rates with skipped results out of the denominator", () => {
    const row = batch.evals.find((e) => e.evalName === "forbidden-tool")!;
    expect(row.passRate).toBe(0.5);
    expect(row.traces).toBe(2);
    // The outlier is named, not just counted.
    expect(row.failingTraces).toEqual(["C:\\traces\\session.jsonl"]);
  });

  it("counts an unreadable trace against the batch without losing the rest", () => {
    expect(batch.summary.tracesErrored).toBe(1);
    expect(batch.summary.traces).toBe(3);
    expect(batch.exitCode).toBe(1);
    expect(batch.evals.length).toBeGreaterThan(0);
  });

  it("json round-trips the batch report", () => {
    const parsed = JSON.parse(renderBatch(batch, "json")) as BatchReport;
    expect(parsed.summary.traces).toBe(3);
    expect(parsed.evals.some((e) => e.evalName === "forbidden-tool")).toBe(true);
  });

  it("human output shows rates, outliers, and the unreadable trace", () => {
    const out = renderBatch(batch, "human");
    expect(out).toContain("3 trace(s)");
    expect(out).toContain("50%");
    expect(out).toContain("forbidden-tool");
    expect(out).toContain("session.jsonl");
    expect(out).toContain("not JSONL");
    expect(out).not.toContain("undefined");
  });

  it("markdown output includes both rate tables and the trace table", () => {
    const out = renderBatch(batch, "markdown");
    expect(out).toContain(
      "| Rate | Artifact | Eval | Grader | Traces | Outcomes | Outliers |",
    );
    expect(out).toContain("## Artifact pass rates");
    expect(out).toContain("## Traces");
    expect(out).toContain("| error |");
    expect(out).not.toContain("undefined");
  });

  it("renders a review-only row as an outlier rather than a bare 0%", () => {
    const reviewed = aggregate(
      [
        {
          file: "C:\\traces\\one.jsonl",
          report: {
            ...report,
            evalResults: [
              { ...report.evalResults[0]!, outcome: "needs-review", findings: [] },
            ],
            summary: {
              total: 1,
              pass: 0,
              fail: 0,
              error: 0,
              needsReview: 1,
              skipped: 0,
            },
          },
        },
      ],
      { durationMs: 1 },
    );
    expect(renderBatch(reviewed, "markdown")).toContain("review: one.jsonl");
    expect(renderBatch(reviewed, "human")).toContain("review: one.jsonl");
  });

  it("says nothing was graded rather than printing 0% for an all-skipped row", () => {
    const skipped = aggregate(
      [
        {
          file: "C:\\traces\\one.jsonl",
          report: {
            ...report,
            evalResults: [
              {
                ...report.evalResults[0]!,
                outcome: "skipped",
                skipReason: "judge cost budget exhausted ($1)",
                findings: [],
              },
            ],
            summary: {
              total: 1,
              pass: 0,
              fail: 0,
              error: 0,
              needsReview: 0,
              skipped: 1,
            },
            exitCode: 0,
          },
        },
      ],
      { durationMs: 1 },
    );
    const row = skipped.evals[0]!;
    expect(row.passRate).toBeNull();
    expect(row.skipReasons).toEqual(["judge cost budget exhausted ($1)"]);
    // An exhausted budget has to be visible in the report, not inferable from
    // a missing row — it is the difference between "held" and "never checked".
    expect(renderBatch(skipped, "human")).toContain("budget exhausted");
    expect(renderBatch(skipped, "human")).toContain("—");
  });

  it("escapes pipes so an aggregate row keeps its column count", () => {
    const piped = aggregate(
      [
        {
          file: "C:\\traces\\one.jsonl",
          report: {
            ...report,
            evalResults: [
              { ...report.evalResults[0]!, evalName: "weird|name", findings: [] },
            ],
          },
        },
      ],
      { durationMs: 1 },
    );
    const out = renderBatch(piped, "markdown");
    const header = out.split("\n").find((l) => l.startsWith("| Rate | Artifact"))!;
    const row = out.split("\n").find((l) => l.includes("weird"))!;
    const cells = (line: string) => line.split(/(?<!\\)\|/).length - 2;
    expect(cells(row)).toBe(cells(header));
  });
});
