import { describe, expect, it } from "vitest";
import { graderFor } from "../../../src/graders/registry.js";
import { makePlan, makeTrace } from "../../helpers.js";

const grader = graderFor("regex")!;

const trace = makeTrace({
  assistantTexts: ["Fixed the crash.", "All tests pass."],
  userMessages: ["Fix the crash please"],
});

describe("regex grader", () => {
  it("matches against assistant text by default", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "regex",
        options: { pattern: "tests pass", expect: "match" },
      }),
    });
    expect(result.findings).toEqual([]);
  });

  it("fails when a required pattern is missing", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "regex",
        options: { pattern: "deployed to prod", expect: "match" },
      }),
    });
    expect(result.findings).toHaveLength(1);
  });

  it("supports no-match expectations and flags", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "regex",
        options: { pattern: "FIXED THE CRASH", flags: "i", expect: "no-match" },
      }),
    });
    expect(result.findings).toHaveLength(1);
  });

  it("errors on an invalid pattern", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "regex",
        options: { pattern: "(", expect: "match" },
      }),
    });
    expect(result.error).toBeDefined();
  });
});
