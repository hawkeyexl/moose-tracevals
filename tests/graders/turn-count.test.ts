import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderTurnCount } from "../../src/graders/code/turn-count.js";
import { makeTrialContext, makeCriterion } from "../helpers.js";

describe("graderTurnCount", () => {
  it("within max_turns -> pass", async () => {
    const ctx = makeTrialContext({ num_turns: 5 });
    const criterion = makeCriterion({
      grader: "turn-count",
      config: { max_turns: 10 },
    });
    const result = await graderTurnCount(criterion, ctx);
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("exceeds max_turns -> fail", async () => {
    const ctx = makeTrialContext({ num_turns: 15 });
    const criterion = makeCriterion({
      grader: "turn-count",
      config: { max_turns: 10 },
    });
    const result = await graderTurnCount(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("below min_turns -> fail", async () => {
    const ctx = makeTrialContext({ num_turns: 2 });
    const criterion = makeCriterion({
      grader: "turn-count",
      config: { min_turns: 5 },
    });
    const result = await graderTurnCount(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("both limits satisfied -> pass", async () => {
    const ctx = makeTrialContext({ num_turns: 7 });
    const criterion = makeCriterion({
      grader: "turn-count",
      config: { min_turns: 5, max_turns: 10 },
    });
    const result = await graderTurnCount(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("no limits -> pass", async () => {
    const ctx = makeTrialContext({ num_turns: 100 });
    const criterion = makeCriterion({
      grader: "turn-count",
      config: {},
    });
    const result = await graderTurnCount(criterion, ctx);
    assert.equal(result.pass, true);
  });
});
