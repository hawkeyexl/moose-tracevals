import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderDiffCheck } from "../../src/graders/code/diff-check.js";
import { makeTrialContext, makeCriterion } from "../helpers.js";

describe("graderDiffCheck", () => {
  it("expect=unchanged, file unchanged -> pass", async () => {
    const before = new Map([["file.ts", "content"]]);
    const after = new Map([["file.ts", "content"]]);
    const ctx = makeTrialContext({ workspace_before: before, workspace_after: after });
    const criterion = makeCriterion({
      grader: "diff-check",
      config: { expect: "unchanged", files: ["file.ts"] },
    });
    const result = await graderDiffCheck(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("expect=unchanged, file changed -> fail", async () => {
    const before = new Map([["file.ts", "old content"]]);
    const after = new Map([["file.ts", "new content"]]);
    const ctx = makeTrialContext({ workspace_before: before, workspace_after: after });
    const criterion = makeCriterion({
      grader: "diff-check",
      config: { expect: "unchanged", files: ["file.ts"] },
    });
    const result = await graderDiffCheck(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("expect=changed, file changed -> pass", async () => {
    const before = new Map([["file.ts", "old"]]);
    const after = new Map([["file.ts", "new"]]);
    const ctx = makeTrialContext({ workspace_before: before, workspace_after: after });
    const criterion = makeCriterion({
      grader: "diff-check",
      config: { expect: "changed", files: ["file.ts"] },
    });
    const result = await graderDiffCheck(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("expect=changed, file unchanged -> fail", async () => {
    const before = new Map([["file.ts", "same"]]);
    const after = new Map([["file.ts", "same"]]);
    const ctx = makeTrialContext({ workspace_before: before, workspace_after: after });
    const criterion = makeCriterion({
      grader: "diff-check",
      config: { expect: "changed", files: ["file.ts"] },
    });
    const result = await graderDiffCheck(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("expect=created, file in after but not before -> pass", async () => {
    const before = new Map<string, string>();
    const after = new Map([["new-file.ts", "content"]]);
    const ctx = makeTrialContext({ workspace_before: before, workspace_after: after });
    const criterion = makeCriterion({
      grader: "diff-check",
      config: { expect: "created", files: ["new-file.ts"] },
    });
    const result = await graderDiffCheck(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("expect=created, file missing -> fail", async () => {
    const ctx = makeTrialContext({
      workspace_before: new Map(),
      workspace_after: new Map(),
    });
    const criterion = makeCriterion({
      grader: "diff-check",
      config: { expect: "created", files: ["missing.ts"] },
    });
    const result = await graderDiffCheck(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("expect=deleted, file in before but not after -> pass", async () => {
    const before = new Map([["old-file.ts", "content"]]);
    const after = new Map<string, string>();
    const ctx = makeTrialContext({ workspace_before: before, workspace_after: after });
    const criterion = makeCriterion({
      grader: "diff-check",
      config: { expect: "deleted", files: ["old-file.ts"] },
    });
    const result = await graderDiffCheck(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("code_blocks scope: only checks code blocks", async () => {
    const beforeContent = "text\n```js\nconsole.log('hello')\n```\nmore text";
    const afterContent = "CHANGED text\n```js\nconsole.log('hello')\n```\nCHANGED more text";
    const before = new Map([["file.md", beforeContent]]);
    const after = new Map([["file.md", afterContent]]);
    const ctx = makeTrialContext({ workspace_before: before, workspace_after: after });
    const criterion = makeCriterion({
      grader: "diff-check",
      config: { expect: "unchanged", scope: "code_blocks" },
    });
    const result = await graderDiffCheck(criterion, ctx);
    // Code blocks are the same, only surrounding text changed
    assert.equal(result.pass, true);
  });
});
