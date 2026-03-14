import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderComposite } from "../../src/graders/composite.js";
import { makeTrialContext, makeCriterion } from "../helpers.js";
import type { Criterion } from "../../src/types.js";

// Use real code graders as sub-criteria for testing composite logic
function makeSubCriteria(...configs: Array<{ pass: boolean }>): Criterion[] {
  return configs.map((c, i) => ({
    name: `sub-${i}`,
    type: "code" as const,
    // Use turn-count with limits that make it pass or fail based on the trial context
    grader: "turn-count",
    config: c.pass ? { max_turns: 100 } : { max_turns: 0 },
  }));
}

describe("graderComposite", () => {
  it("all-of: all pass -> pass, avg score", async () => {
    const ctx = makeTrialContext({ num_turns: 5 });
    const criterion = makeCriterion({
      name: "all-check",
      type: "composite",
      grader: "all-of",
      sub_criteria: makeSubCriteria({ pass: true }, { pass: true }),
    });
    const result = await graderComposite(criterion, ctx, "claude-sonnet-4-6");
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
    assert.ok(result.reasoning.includes("All 2 sub-criteria passed"));
  });

  it("all-of: one fails -> fail, lists failed name", async () => {
    const ctx = makeTrialContext({ num_turns: 5 });
    const criterion = makeCriterion({
      name: "all-check",
      type: "composite",
      grader: "all-of",
      sub_criteria: makeSubCriteria({ pass: true }, { pass: false }),
    });
    const result = await graderComposite(criterion, ctx, "claude-sonnet-4-6");
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("Failed sub-criteria"));
  });

  it("any-of: one passes -> pass, max score", async () => {
    const ctx = makeTrialContext({ num_turns: 5 });
    const criterion = makeCriterion({
      name: "any-check",
      type: "composite",
      grader: "any-of",
      sub_criteria: makeSubCriteria({ pass: false }, { pass: true }),
    });
    const result = await graderComposite(criterion, ctx, "claude-sonnet-4-6");
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("any-of: none pass -> fail", async () => {
    const ctx = makeTrialContext({ num_turns: 5 });
    const criterion = makeCriterion({
      name: "any-check",
      type: "composite",
      grader: "any-of",
      sub_criteria: makeSubCriteria({ pass: false }, { pass: false }),
    });
    const result = await graderComposite(criterion, ctx, "claude-sonnet-4-6");
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("None of"));
  });

  it("weighted: above 0.7 -> pass", async () => {
    const ctx = makeTrialContext({ num_turns: 5 });
    const subs = makeSubCriteria({ pass: true }, { pass: true });
    subs[0].weight = 3;
    subs[1].weight = 1;
    const criterion = makeCriterion({
      name: "weighted-check",
      type: "composite",
      grader: "weighted",
      sub_criteria: subs,
    });
    const result = await graderComposite(criterion, ctx, "claude-sonnet-4-6");
    assert.equal(result.pass, true);
    assert.ok(result.score >= 0.7);
  });

  it("weighted: below 0.7 -> fail", async () => {
    const ctx = makeTrialContext({ num_turns: 5 });
    const subs = makeSubCriteria({ pass: false }, { pass: true });
    subs[0].weight = 3; // failing sub has higher weight
    subs[1].weight = 1;
    const criterion = makeCriterion({
      name: "weighted-check",
      type: "composite",
      grader: "weighted",
      sub_criteria: subs,
    });
    const result = await graderComposite(criterion, ctx, "claude-sonnet-4-6");
    // weighted score = (0*3 + 1*1) / 4 = 0.25, which is < 0.7
    assert.equal(result.pass, false);
    assert.ok(result.score < 0.7);
  });

  it("no sub_criteria -> fail", async () => {
    const ctx = makeTrialContext();
    const criterion = makeCriterion({
      name: "empty",
      type: "composite",
      grader: "all-of",
      sub_criteria: [],
    });
    const result = await graderComposite(criterion, ctx, "claude-sonnet-4-6");
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("No sub-criteria"));
  });
});
