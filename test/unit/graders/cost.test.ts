import { describe, expect, it } from "vitest";
import { graderFor } from "../../../src/graders/registry.js";
import { makePlan, makeTrace } from "../../helpers.js";

const grader = graderFor("cost")!;

describe("cost grader", () => {
  it("passes under the budget", async () => {
    const result = await grader.grade({
      trace: makeTrace({
        usage: { inputTokens: 10, outputTokens: 5, totalCostUsd: 0.05 },
      }),
      plan: makePlan({ grader: "cost", options: { maxUsd: 0.1 } }),
    });
    expect(result.findings).toEqual([]);
  });

  it("fails over the budget", async () => {
    const result = await grader.grade({
      trace: makeTrace({
        usage: { inputTokens: 10, outputTokens: 5, totalCostUsd: 0.5 },
      }),
      plan: makePlan({ grader: "cost", options: { maxUsd: 0.1 } }),
    });
    expect(result.findings).toHaveLength(1);
  });

  it("skips with a reason when the trace has no cost data", async () => {
    const result = await grader.grade({
      trace: makeTrace({ usage: { inputTokens: 10, outputTokens: 5 } }),
      plan: makePlan({ grader: "cost", options: { maxUsd: 0.1 } }),
    });
    expect(result.findings).toEqual([]);
    expect(result.skipped).toContain("cost");
  });

  it("enforces token budgets when cost is absent but tokens are present", async () => {
    const result = await grader.grade({
      trace: makeTrace({ usage: { inputTokens: 900, outputTokens: 200 } }),
      plan: makePlan({ grader: "cost", options: { maxTokens: 1000 } }),
    });
    expect(result.findings).toHaveLength(1);
  });

  it("still checks the token budget when maxUsd is unavailable but both are set", async () => {
    // Claude session files carry token usage but no totalCostUsd. The missing
    // cost data must not suppress the token check.
    const over = await grader.grade({
      trace: makeTrace({ usage: { inputTokens: 900, outputTokens: 200 } }),
      plan: makePlan({
        grader: "cost",
        options: { maxUsd: 0.1, maxTokens: 1000 },
      }),
    });
    expect(over.findings).toHaveLength(1);
    expect(over.skipped).toBeUndefined();

    const under = await grader.grade({
      trace: makeTrace({ usage: { inputTokens: 100, outputTokens: 50 } }),
      plan: makePlan({
        grader: "cost",
        options: { maxUsd: 0.1, maxTokens: 1000 },
      }),
    });
    expect(under.findings).toEqual([]);
    expect(under.skipped).toBeUndefined();
  });
});
