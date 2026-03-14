import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graderFileExists } from "../../src/graders/code/file-exists.js";
import { makeTrialContext, makeCriterion } from "../helpers.js";

describe("graderFileExists", () => {
  it("file in workspace_after, expect=exists -> pass", async () => {
    const after = new Map([["output.json", '{"result": true}']]);
    const ctx = makeTrialContext({ workspace_after: after });
    const criterion = makeCriterion({
      grader: "file-exists",
      config: { files: ["output.json"], expect: "exists" },
    });
    const result = await graderFileExists(criterion, ctx);
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("file missing, expect=exists -> fail with score", async () => {
    const after = new Map([["other.json", "data"]]);
    const ctx = makeTrialContext({ workspace_after: after });
    const criterion = makeCriterion({
      grader: "file-exists",
      config: { files: ["output.json", "other.json"], expect: "exists" },
    });
    const result = await graderFileExists(criterion, ctx);
    assert.equal(result.pass, false);
    // 1 of 2 files found = 0.5
    assert.equal(result.score, 0.5);
  });

  it("file present, expect=not_exists -> fail", async () => {
    const after = new Map([["should-not-exist.txt", "content"]]);
    const ctx = makeTrialContext({ workspace_after: after });
    const criterion = makeCriterion({
      grader: "file-exists",
      config: { files: ["should-not-exist.txt"], expect: "not_exists" },
    });
    const result = await graderFileExists(criterion, ctx);
    assert.equal(result.pass, false);
  });

  it("no files config -> fail", async () => {
    const ctx = makeTrialContext();
    const criterion = makeCriterion({
      grader: "file-exists",
      config: {},
    });
    const result = await graderFileExists(criterion, ctx);
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("No files"));
  });

  it("partial match: score = matched/total", async () => {
    const after = new Map([
      ["a.ts", "content"],
      ["b.ts", "content"],
    ]);
    const ctx = makeTrialContext({ workspace_after: after });
    const criterion = makeCriterion({
      grader: "file-exists",
      config: { files: ["a.ts", "b.ts", "c.ts"], expect: "exists" },
    });
    const result = await graderFileExists(criterion, ctx);
    assert.equal(result.pass, false);
    // 2 of 3 found ≈ 0.667
    assert.ok(Math.abs(result.score - 2 / 3) < 0.01);
  });
});
