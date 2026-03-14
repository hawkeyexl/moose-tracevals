import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderRegexMatch } from "../../src/graders/code/regex-match.js";
import { makeTrialContext, makeCriterion, makeTranscriptMsg } from "../helpers.js";

describe("graderRegexMatch", () => {
  it("pattern present, expect=present -> pass", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({ type: "assistant", role: "assistant", content: "Test passed successfully" }),
      ],
    });
    const criterion = makeCriterion({
      grader: "regex-match",
      config: { pattern: "passed", expect: "present" },
    });
    const result = await graderRegexMatch(criterion, ctx);
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("pattern absent, expect=present -> fail", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({ type: "assistant", role: "assistant", content: "Nothing here" }),
      ],
    });
    const criterion = makeCriterion({
      grader: "regex-match",
      config: { pattern: "missing-pattern", expect: "present" },
    });
    const result = await graderRegexMatch(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("pattern present, expect=absent -> fail", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({ type: "assistant", role: "assistant", content: "ERROR: something broke" }),
      ],
    });
    const criterion = makeCriterion({
      grader: "regex-match",
      config: { pattern: "ERROR", expect: "absent" },
    });
    const result = await graderRegexMatch(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("pattern absent, expect=absent -> pass", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({ type: "assistant", role: "assistant", content: "All good" }),
      ],
    });
    const criterion = makeCriterion({
      grader: "regex-match",
      config: { pattern: "ERROR", expect: "absent" },
    });
    const result = await graderRegexMatch(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("scope=files searches workspace_after", async () => {
    const after = new Map([["output.txt", "Found the target value"]]);
    const ctx = makeTrialContext({ workspace_after: after });
    const criterion = makeCriterion({
      grader: "regex-match",
      config: { pattern: "target value", expect: "present", scope: "files" },
    });
    const result = await graderRegexMatch(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("no pattern config -> fail with message", async () => {
    const ctx = makeTrialContext();
    const criterion = makeCriterion({
      grader: "regex-match",
      config: {},
    });
    const result = await graderRegexMatch(criterion, ctx);
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("No pattern"));
  });

  it("case-insensitive matching works", async () => {
    const ctx = makeTrialContext({
      transcript: [
        makeTranscriptMsg({ type: "assistant", role: "assistant", content: "SUCCESS completed" }),
      ],
    });
    const criterion = makeCriterion({
      grader: "regex-match",
      config: { pattern: "success", expect: "present" },
    });
    const result = await graderRegexMatch(criterion, ctx);
    assert.equal(result.pass, true);
  });
});
