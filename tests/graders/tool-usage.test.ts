import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderToolUsage } from "../../src/graders/code/tool-usage.js";
import { makeTrialContext, makeCriterion, makeTranscriptMsg } from "../helpers.js";

describe("graderToolUsage", () => {
  it("expected tool used -> pass", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Read", input: {} },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "tool-usage",
      config: { expected_tools: ["Read"], expect: "used" },
    });
    const result = await graderToolUsage(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("expected tool not used -> fail", async () => {
    const ctx = makeTrialContext({ transcript: [] });
    const criterion = makeCriterion({
      grader: "tool-usage",
      config: { expected_tools: ["Read"], expect: "used" },
    });
    const result = await graderToolUsage(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("forbidden tool used -> fail", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Bash", input: {} },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "tool-usage",
      config: { forbidden_tools: ["Bash"] },
    });
    const result = await graderToolUsage(criterion, ctx);
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("Forbidden"));
  });

  it("forbidden tool not used -> pass", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Read", input: {} },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "tool-usage",
      config: { forbidden_tools: ["Bash"] },
    });
    const result = await graderToolUsage(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("case-insensitive matching", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "read", input: {} },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "tool-usage",
      config: { expected_tools: ["Read"], expect: "used" },
    });
    const result = await graderToolUsage(criterion, ctx);
    assert.equal(result.pass, true);
  });
});
