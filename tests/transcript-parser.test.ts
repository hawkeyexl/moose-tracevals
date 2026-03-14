import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTranscriptContent } from "../src/transcript-parser.js";

describe("parseTranscriptContent", () => {
  it("empty input returns empty messages and defaults", () => {
    const result = parseTranscriptContent("");
    assert.deepStrictEqual(result.messages, []);
    assert.equal(result.model, "");
    assert.equal(result.declared_agents.length, 0);
    assert.equal(result.declared_tools.length, 0);
    assert.equal(result.invoked_skills.length, 0);
    assert.equal(result.result, undefined);
  });

  it("system/init message extracts cwd, model, agents, tools", () => {
    const lines = [
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/home/user/project",
        model: "claude-sonnet-4-6",
        agents: [{ name: "code-reviewer" }, { name: "test-runner" }],
        tools: ["Read", "Write", "Bash"],
        skills: ["doc-detective"],
      }),
    ].join("\n");

    const result = parseTranscriptContent(lines);
    assert.equal(result.cwd, "/home/user/project");
    assert.equal(result.model, "claude-sonnet-4-6");
    assert.deepStrictEqual(result.declared_agents, ["code-reviewer", "test-runner"]);
    assert.deepStrictEqual(result.declared_tools, ["Read", "Write", "Bash"]);
    assert.deepStrictEqual(result.invoked_skills, ["doc-detective"]);
  });

  it("assistant tool_use extracts Skill, Agent, Read/Write/Edit invocations", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "t1", name: "Skill", input: { skill: "doc-detective-test" } },
            { type: "tool_use", id: "t2", name: "Agent", input: { description: "run tests", prompt: "subagent_type=Explore" } },
            { type: "tool_use", id: "t3", name: "Read", input: { file_path: "/tmp/file.md" } },
            { type: "tool_use", id: "t4", name: "Write", input: { file_path: "/tmp/output.md" } },
          ],
        },
      }),
    ].join("\n");

    const result = parseTranscriptContent(lines);
    assert.ok(result.invoked_skills.includes("doc-detective-test"));
    assert.ok(result.spawned_agents.includes("run tests"));
    assert.ok(result.spawned_agents.includes("Explore"));
    assert.ok(result.accessed_files.includes("/tmp/file.md"));
    assert.ok(result.accessed_files.includes("/tmp/output.md"));
  });

  it("result message extracts num_turns, cost, is_error, subtype", () => {
    const lines = [
      JSON.stringify({
        type: "result",
        num_turns: 12,
        total_cost_usd: 0.05,
        is_error: false,
        subtype: "success",
      }),
    ].join("\n");

    const result = parseTranscriptContent(lines);
    assert.ok(result.result);
    assert.equal(result.result!.num_turns, 12);
    assert.equal(result.result!.total_cost_usd, 0.05);
    assert.equal(result.result!.is_error, false);
    assert.equal(result.result!.subtype, "success");
  });

  it("deduplication: same skill invoked twice appears once", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "t1", name: "Skill", input: { skill: "my-skill" } },
          ],
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "t2", name: "Skill", input: { skill: "my-skill" } },
          ],
        },
      }),
    ].join("\n");

    const result = parseTranscriptContent(lines);
    assert.equal(result.invoked_skills.filter((s) => s === "my-skill").length, 1);
  });

  it("malformed lines are skipped gracefully", () => {
    const lines = [
      "this is not json",
      "{ broken json",
      JSON.stringify({ type: "result", num_turns: 1, total_cost_usd: 0, is_error: false, subtype: "" }),
    ].join("\n");

    const result = parseTranscriptContent(lines);
    // Should parse only the valid line
    assert.equal(result.messages.length, 1);
    assert.ok(result.result);
  });
});
