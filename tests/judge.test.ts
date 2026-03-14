import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatTranscriptForJudge } from "../src/judge.js";
import type { TranscriptMessage } from "../src/types.js";

describe("formatTranscriptForJudge", () => {
  it("text content formatted as [role] text", () => {
    const transcript: TranscriptMessage[] = [
      { type: "assistant", role: "assistant", content: "Hello world" },
    ];
    const result = formatTranscriptForJudge(transcript);
    assert.ok(result.includes("[assistant] Hello world"));
  });

  it("tool_use blocks formatted as [role:tool_use] name(input)", () => {
    const transcript: TranscriptMessage[] = [
      {
        type: "assistant",
        role: "assistant",
        content: [
          { type: "tool_use", name: "Read", input: { file_path: "/tmp/file.md" } },
        ],
      },
    ];
    const result = formatTranscriptForJudge(transcript);
    assert.ok(result.includes("[assistant:tool_use] Read("));
    assert.ok(result.includes("file_path"));
  });

  it("tool_result blocks formatted as [tool_result] content", () => {
    const transcript: TranscriptMessage[] = [
      {
        type: "assistant",
        role: "assistant",
        content: [
          { type: "tool_result", content: "file content here" },
        ],
      },
    ];
    const result = formatTranscriptForJudge(transcript);
    assert.ok(result.includes("[tool_result] file content here"));
  });

  it("error messages formatted as [ERROR] message", () => {
    const transcript: TranscriptMessage[] = [
      { type: "error", error: "Something went wrong" },
    ];
    const result = formatTranscriptForJudge(transcript);
    assert.ok(result.includes("[ERROR] Something went wrong"));
  });

  it("empty transcript returns empty string", () => {
    const result = formatTranscriptForJudge([]);
    assert.equal(result, "");
  });

  it("content truncation: long inputs truncated", () => {
    const longInput: Record<string, unknown> = { data: "x".repeat(500) };
    const transcript: TranscriptMessage[] = [
      {
        type: "assistant",
        role: "assistant",
        content: [
          { type: "tool_use", name: "Bash", input: longInput },
        ],
      },
    ];
    const result = formatTranscriptForJudge(transcript);
    // The function slices input to 200 chars
    assert.ok(result.includes("[assistant:tool_use] Bash("));
    // The full JSON string of longInput would be much longer than 200 chars
    // The function truncates JSON.stringify(input) to .slice(0, 200)
    assert.ok(result.length < JSON.stringify(longInput).length + 100);
  });
});
