import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderCostCheck } from "../../src/graders/code/cost-check.js";
import { makeTrialContext, makeCriterion } from "../helpers.js";

describe("graderCostCheck", () => {
  it("within budget -> pass, score=1.0", async () => {
    const ctx = makeTrialContext({ cost_usd: 0.05 });
    const criterion = makeCriterion({
      grader: "cost-check",
      config: { max_cost_usd: 1.00 },
    });
    const result = await graderCostCheck(criterion, ctx);
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("over budget -> fail, degraded score", async () => {
    const ctx = makeTrialContext({ cost_usd: 1.50 });
    const criterion = makeCriterion({
      grader: "cost-check",
      config: { max_cost_usd: 1.00 },
    });
    const result = await graderCostCheck(criterion, ctx);
    assert.equal(result.pass, false);
    // score = max(0, 1.0 - (1.50 - 1.00) / 1.00) = max(0, 0.5) = 0.5
    assert.ok(Math.abs(result.score - 0.5) < 0.01);
  });

  it("no max set -> pass", async () => {
    const ctx = makeTrialContext({ cost_usd: 99.99 });
    const criterion = makeCriterion({
      grader: "cost-check",
      config: {},
    });
    const result = await graderCostCheck(criterion, ctx);
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("way over budget -> score floors at 0", async () => {
    const ctx = makeTrialContext({ cost_usd: 10.00 });
    const criterion = makeCriterion({
      grader: "cost-check",
      config: { max_cost_usd: 1.00 },
    });
    const result = await graderCostCheck(criterion, ctx);
    assert.equal(result.pass, false);
    // score = max(0, 1.0 - (10.0 - 1.0) / 1.0) = max(0, -8.0) = 0
    assert.equal(result.score, 0);
  });
});
