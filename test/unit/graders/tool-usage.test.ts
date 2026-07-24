import { describe, expect, it } from "vitest";
import { graderFor } from "../../../src/graders/registry.js";
import { makePlan, makeTrace } from "../../helpers.js";

const grader = graderFor("tool-usage")!;

const trace = makeTrace({
  toolCalls: [
    { name: "Read", input: {}, sidechain: false },
    { name: "Read", input: {}, sidechain: false },
    { name: "Bash", input: {}, sidechain: false },
    { name: "WebSearch", input: {}, sidechain: true },
  ],
});

describe("tool-usage grader", () => {
  it("passes when an expected tool was used", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "tool-usage",
        options: { tool: "Read", expect: "used" },
      }),
    });
    expect(result.findings).toEqual([]);
  });

  it("fails when a forbidden tool was used", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "tool-usage",
        options: { tool: "Bash", expect: "not-used" },
      }),
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("error");
    expect(result.findings[0]?.message).toContain("Bash");
  });

  it("ignores sidechain calls by default but counts them on request", async () => {
    const scoped = await grader.grade({
      trace,
      plan: makePlan({
        grader: "tool-usage",
        options: { tool: "WebSearch", expect: "used" },
      }),
    });
    expect(scoped.findings).toHaveLength(1);

    const included = await grader.grade({
      trace,
      plan: makePlan({
        grader: "tool-usage",
        options: { tool: "WebSearch", expect: "used", includeSidechains: true },
      }),
    });
    expect(included.findings).toEqual([]);
  });

  it("enforces min/max call counts", async () => {
    const tooMany = await grader.grade({
      trace,
      plan: makePlan({
        grader: "tool-usage",
        options: { tool: "Read", max: 1 },
      }),
    });
    expect(tooMany.findings).toHaveLength(1);

    const enough = await grader.grade({
      trace,
      plan: makePlan({
        grader: "tool-usage",
        options: { tool: "Read", min: 2 },
      }),
    });
    expect(enough.findings).toEqual([]);
  });

  it("errors on missing options", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({ grader: "tool-usage" }),
    });
    expect(result.error).toContain("tool");
  });

  it("reports at the plan's severity", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "tool-usage",
        severity: "warning",
        options: { tool: "Bash", expect: "not-used" },
      }),
    });
    expect(result.findings[0]?.severity).toBe("warning");
  });
});
