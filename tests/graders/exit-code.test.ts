import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderExitCode } from "../../src/graders/code/exit-code.js";
import { makeTrialContext, makeCriterion, makeTranscriptMsg } from "../helpers.js";

describe("graderExitCode", () => {
  it("exit code matches expected -> pass", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Bash", input: { command: "npm test" } },
        }),
        makeTranscriptMsg({
          type: "tool",
          tool_result: { tool_use_id: "t1", content: "Tests passed\nexit code: 0" },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "exit-code",
      config: { expected_code: 0 },
    });
    const result = await graderExitCode(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("exit code differs -> fail", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Bash", input: { command: "npm test" } },
        }),
        makeTranscriptMsg({
          type: "tool",
          tool_result: { tool_use_id: "t1", content: "Tests failed\nexit code: 1" },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "exit-code",
      config: { expected_code: 0 },
    });
    const result = await graderExitCode(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("command_pattern filter: only checks matching commands", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Bash", input: { command: "ls -la" } },
        }),
        makeTranscriptMsg({
          type: "tool",
          tool_result: { tool_use_id: "t1", content: "exit code: 1" },
        }),
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t2", name: "Bash", input: { command: "npm test" } },
        }),
        makeTranscriptMsg({
          type: "tool",
          tool_result: { tool_use_id: "t2", content: "exit code: 0" },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "exit-code",
      config: { expected_code: 0, command_pattern: "npm test" },
    });
    const result = await graderExitCode(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("no Bash tool in transcript -> fail", async () => {
    const ctx = makeTrialContext({ transcript: [] });
    const criterion = makeCriterion({
      grader: "exit-code",
      config: { expected_code: 0 },
    });
    const result = await graderExitCode(criterion, ctx);
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("No Bash"));
  });

  it("no explicit exit code defaults to 0 -> pass when expected=0", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          tool_use: { id: "t1", name: "Bash", input: { command: "echo hello" } },
        }),
        makeTranscriptMsg({
          type: "tool",
          tool_result: { tool_use_id: "t1", content: "hello" },
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "exit-code",
      config: { expected_code: 0 },
    });
    const result = await graderExitCode(criterion, ctx);
    assert.equal(result.pass, true);
  });
});
