import { describe, expect, it } from "vitest";
import { graderFor } from "../../../src/graders/registry.js";
import { makePlan, makeTrace } from "../../helpers.js";

const grader = graderFor("turn-count")!;

describe("turn-count grader", () => {
  it("passes within bounds", async () => {
    const result = await grader.grade({
      trace: makeTrace({ turnCount: 5 }),
      plan: makePlan({ grader: "turn-count", options: { min: 1, max: 10 } }),
    });
    expect(result.findings).toEqual([]);
  });

  it("fails above max and below min", async () => {
    const over = await grader.grade({
      trace: makeTrace({ turnCount: 20 }),
      plan: makePlan({ grader: "turn-count", options: { max: 10 } }),
    });
    expect(over.findings).toHaveLength(1);

    const under = await grader.grade({
      trace: makeTrace({ turnCount: 0 }),
      plan: makePlan({ grader: "turn-count", options: { min: 1 } }),
    });
    expect(under.findings).toHaveLength(1);
  });
});
