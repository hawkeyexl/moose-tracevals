import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listGraders, runGrader } from "../../src/graders/index.js";
import { makeTrialContext, makeCriterion } from "../helpers.js";

describe("listGraders", () => {
  it("returns 21 names (9 code + 9 LLM + 3 composite)", () => {
    const graders = listGraders();
    assert.equal(graders.length, 21);
    // Verify key graders are present
    assert.ok(graders.includes("trigger-check"));
    assert.ok(graders.includes("diff-check"));
    assert.ok(graders.includes("regex-match"));
    assert.ok(graders.includes("exit-code"));
    assert.ok(graders.includes("file-exists"));
    assert.ok(graders.includes("json-schema"));
    assert.ok(graders.includes("tool-usage"));
    assert.ok(graders.includes("turn-count"));
    assert.ok(graders.includes("cost-check"));
    assert.ok(graders.includes("criteria-adherence"));
    assert.ok(graders.includes("all-of"));
    assert.ok(graders.includes("any-of"));
    assert.ok(graders.includes("weighted"));
  });
});

describe("runGrader", () => {
  it("unknown grader returns fail with 'Unknown grader' message", async () => {
    const ctx = makeTrialContext();
    const criterion = makeCriterion({ grader: "nonexistent-grader" });
    const result = await runGrader(criterion, ctx, "claude-sonnet-4-6");
    assert.equal(result.pass, false);
    assert.equal(result.score, 0.0);
    assert.ok(result.reasoning.includes("Unknown grader"));
  });

  it("dispatches to code grader and returns correct result", async () => {
    const ctx = makeTrialContext({ num_turns: 5 });
    const criterion = makeCriterion({
      name: "turn-test",
      grader: "turn-count",
      config: { max_turns: 10 },
    });
    const result = await runGrader(criterion, ctx, "claude-sonnet-4-6");
    assert.equal(result.pass, true);
    assert.equal(result.grader, "turn-count");
    assert.equal(result.name, "turn-test");
  });
});
