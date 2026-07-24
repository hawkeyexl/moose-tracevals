import { describe, expect, it } from "vitest";
import { renderTrace } from "../../src/judge/render.js";
import { makeTrace } from "../helpers.js";

const trace = makeTrace({
  model: "claude-opus-4-8",
  turnCount: 2,
  events: [
    { kind: "user", text: "Fix the crash.", raw: {} },
    { kind: "assistant", text: "On it.", raw: {} },
    { kind: "tool_call", toolName: "Read", raw: {} },
    { kind: "tool_call", toolName: "Grep", sidechain: true, raw: {} },
  ],
  toolCalls: [
    { name: "Read", input: { file_path: "src/app.ts" }, sidechain: false },
    { name: "Grep", input: { pattern: "x" }, sidechain: true },
  ],
  skillInvocations: [{ name: "fix-bug", via: "skill-tool" }],
  userMessages: ["Fix the crash."],
  assistantTexts: ["On it."],
});

describe("renderTrace", () => {
  it("includes metadata, messages, tools, and skills", () => {
    const out = renderTrace(trace);
    expect(out).toContain("claude-opus-4-8");
    expect(out).toContain("Fix the crash.");
    expect(out).toContain("On it.");
    expect(out).toContain("Read");
    expect(out).toContain("fix-bug");
  });

  it("marks sidechain activity", () => {
    const out = renderTrace(trace);
    expect(out).toContain("sidechain");
  });

  it("truncates oversized blocks", () => {
    const big = makeTrace({
      events: [{ kind: "assistant", text: "x".repeat(10_000), raw: {} }],
      assistantTexts: ["x".repeat(10_000)],
    });
    const out = renderTrace(big, { maxBlockChars: 100 });
    expect(out).toContain("truncated");
    expect(out.length).toBeLessThan(5_000);
  });

  it("caps total size with a head/tail window", () => {
    const events = Array.from({ length: 500 }, (_, i) => ({
      kind: "assistant" as const,
      text: `message number ${i} ${"y".repeat(200)}`,
      raw: {},
    }));
    const big = makeTrace({ events });
    const out = renderTrace(big, { maxTotalChars: 10_000 });
    expect(out.length).toBeLessThan(12_000);
    expect(out).toContain("message number 0");
    expect(out).toContain("message number 499");
    expect(out).toContain("truncated");
  });
});
