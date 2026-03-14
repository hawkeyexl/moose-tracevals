import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderTriggerCheck } from "../../src/graders/code/trigger-check.js";
import { makeTrialContext, makeCriterion, makeTranscriptMsg } from "../helpers.js";

describe("graderTriggerCheck", () => {
  it("skill found via tool_use.name=Skill -> pass", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Skill", input: { skill: "my-skill" } },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "trigger-check",
      config: { skill_name: "my-skill", should_trigger: true },
    });
    const result = await graderTriggerCheck(criterion, ctx);
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("skill NOT found -> fail when should_trigger=true", async () => {
    const ctx = makeTrialContext({ transcript: [] });
    const criterion = makeCriterion({
      grader: "trigger-check",
      config: { skill_name: "missing-skill", should_trigger: true },
    });
    const result = await graderTriggerCheck(criterion, ctx);
    assert.equal(result.pass, false);
    assert.equal(result.score, 0.0);
  });

  it("should_trigger=false, not found -> pass", async () => {
    const ctx = makeTrialContext({ transcript: [] });
    const criterion = makeCriterion({
      grader: "trigger-check",
      config: { skill_name: "my-skill", should_trigger: false },
    });
    const result = await graderTriggerCheck(criterion, ctx);
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("should_trigger=false, found -> fail", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Skill", input: { skill: "my-skill" } },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "trigger-check",
      config: { skill_name: "my-skill", should_trigger: false },
    });
    const result = await graderTriggerCheck(criterion, ctx);
    assert.equal(result.pass, false);
    assert.equal(result.score, 0.0);
  });

  it("agent found via Agent tool -> pass", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Agent", input: { description: "run code-reviewer", prompt: "" } },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "trigger-check",
      config: { agent_name: "code-reviewer", should_trigger: true },
    });
    const result = await graderTriggerCheck(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("content block tool_use detected", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "Skill", input: { skill: "my-skill" } },
          ],
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "trigger-check",
      config: { skill_name: "my-skill", should_trigger: true },
    });
    const result = await graderTriggerCheck(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("case-insensitive matching works", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Skill", input: { skill: "My-SKILL" } },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "trigger-check",
      config: { skill_name: "my-skill", should_trigger: true },
    });
    const result = await graderTriggerCheck(criterion, ctx);
    assert.equal(result.pass, true);
  });
});
