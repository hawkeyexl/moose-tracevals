import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectContentFormat, detectFormat } from "../../src/trace/detect.js";
import { parseTraceFile } from "../../src/trace/claude.js";
import { AgentevalsError } from "../../src/types.js";

const sessionFixture = fileURLToPath(
  new URL("../fixtures/traces/claude-session.jsonl", import.meta.url),
);
const streamFixture = fileURLToPath(
  new URL("../fixtures/traces/claude-stream.jsonl", import.meta.url),
);

describe("detectFormat", () => {
  it("detects a Claude Code session file", () => {
    const line = `{"parentUuid":null,"isSidechain":false,"type":"user","sessionId":"x","message":{"role":"user","content":"hi"}}`;
    expect(detectFormat(line)).toBe("claude-session");
  });

  it("detects session files whose first record is a non-message type", () => {
    const line = `{"type":"queue-operation","operation":"enqueue","sessionId":"x","content":"hi"}`;
    expect(detectFormat(line)).toBe("claude-session");
  });

  it("detects legacy claude -p stream-json", () => {
    const line = `{"type":"system","subtype":"init","cwd":"/x","session_id":"y","model":"m"}`;
    expect(detectFormat(line)).toBe("claude-stream");
  });

  it("rejects unknown formats with an operational error", () => {
    expect(() => detectFormat(`{"hello":"world"}`)).toThrow(AgentevalsError);
    expect(() => detectFormat("not json at all")).toThrow(AgentevalsError);
  });
});

describe("detectContentFormat", () => {
  it("scans past a leading unidentifiable record (e.g. summary) to the format-bearing line", () => {
    const content = [
      `{"type":"summary","summary":"prior session","leafUuid":"abc"}`,
      `{"parentUuid":null,"isSidechain":false,"type":"user","sessionId":"x","message":{"role":"user","content":"hi"}}`,
    ].join("\n");
    expect(detectContentFormat(content)).toBe("claude-session");
  });

  it("scans past malformed leading lines", () => {
    const content = [
      `not json`,
      `{"type":"system","subtype":"init","session_id":"y","model":"m"}`,
    ].join("\n");
    expect(detectContentFormat(content)).toBe("claude-stream");
  });

  it("throws when no line identifies a format", () => {
    const content = [
      `{"type":"summary","leafUuid":"abc"}`,
      `{"type":"other","foo":1}`,
    ].join("\n");
    expect(() => detectContentFormat(content)).toThrow(AgentevalsError);
  });
});

describe("parseTraceFile (session dialect)", () => {
  it("extracts session metadata", async () => {
    const trace = await parseTraceFile(sessionFixture);
    expect(trace.source).toBe("claude-code");
    expect(trace.sessionId).toBe("11111111-1111-1111-1111-111111111111");
    expect(trace.cwd).toBe("C:\\work\\demo-project");
    expect(trace.gitBranch).toBe("claude/fix-bug");
    expect(trace.model).toBe("claude-opus-4-8");
  });

  it("extracts Skill tool invocations", async () => {
    const trace = await parseTraceFile(sessionFixture);
    expect(trace.skillInvocations).toContainEqual({
      name: "fix-bug",
      via: "skill-tool",
      args: "src/app.ts",
    });
  });

  it("extracts <command-name> injections as skill refs, stripping the slash", async () => {
    const trace = await parseTraceFile(sessionFixture);
    expect(trace.skillInvocations).toContainEqual({
      name: "writing-toolkit:identify-ai-tells",
      via: "command-injection",
      args: "docs/draft.md",
    });
  });

  it("extracts agent spawns from subagent_type, not prompt guessing", async () => {
    const trace = await parseTraceFile(sessionFixture);
    expect(trace.agentSpawns).toEqual([
      { subagentType: "Explore", description: "Explore crash site" },
      { subagentType: "doc-writer", description: "Document the fix" },
    ]);
  });

  it("extracts file accesses with operations", async () => {
    const trace = await parseTraceFile(sessionFixture);
    expect(trace.fileAccesses).toContainEqual({
      path: "C:\\work\\demo-project\\src\\app.ts",
      op: "read",
    });
    expect(trace.fileAccesses).toContainEqual({
      path: "C:\\work\\demo-project\\src\\app.ts",
      op: "edit",
    });
    expect(trace.fileAccesses).toContainEqual({
      path: "C:\\work\\demo-project\\notes.md",
      op: "write",
    });
  });

  it("flags sidechain tool calls and keeps main-chain ones unflagged", async () => {
    const trace = await parseTraceFile(sessionFixture);
    const sidechainRead = trace.toolCalls.find(
      (c) => c.name === "Read" && c.sidechain,
    );
    expect(sidechainRead).toBeDefined();
    const bash = trace.toolCalls.find((c) => c.name === "Bash");
    expect(bash?.sidechain).toBe(false);
  });

  it("counts turns as non-sidechain user prompts (not tool results)", async () => {
    const trace = await parseTraceFile(sessionFixture);
    // The injection prompt and the plain prompt; tool_result records and the
    // sidechain user record do not count.
    expect(trace.turnCount).toBe(2);
  });

  it("sums usage across non-sidechain assistant messages", async () => {
    const trace = await parseTraceFile(sessionFixture);
    // 100+200+150+120+90+70+60 input, 50+25+30+40+35+15+20 output (sidechain 80/10 excluded)
    expect(trace.usage).toMatchObject({ inputTokens: 790, outputTokens: 215 });
  });

  it("collects user prompts and assistant texts", async () => {
    const trace = await parseTraceFile(sessionFixture);
    expect(trace.userMessages).toContain(
      "Fix the crash in src/app.ts. Use the fix-bug skill.",
    );
    expect(
      trace.assistantTexts.some((t) => t.includes("Fixed the crash")),
    ).toBe(true);
  });

  it("tolerates malformed JSONL lines with a warning", async () => {
    const trace = await parseTraceFile(sessionFixture);
    expect(trace.warnings.some((w) => w.includes("unparseable"))).toBe(true);
  });
});

describe("parseTraceFile (stream dialect)", () => {
  it("extracts metadata from system/init and result records", async () => {
    const trace = await parseTraceFile(streamFixture);
    expect(trace.source).toBe("claude-code");
    expect(trace.sessionId).toBe("7bd91576-4e75-47d1-9a8e-10aad7099e7b");
    expect(trace.cwd).toBe(
      "/mnt/c/Users/hawkeyexl/Documents/Workspaces/agent-tools/agent-evals",
    );
    expect(trace.model).toBe("claude-sonnet-4-6");
    expect(trace.isError).toBe(false);
    expect(trace.turnCount).toBe(1);
  });

  it("takes usage and cost from the result record", async () => {
    const trace = await parseTraceFile(streamFixture);
    expect(trace.usage?.inputTokens).toBe(3);
    expect(trace.usage?.outputTokens).toBe(5);
    expect(trace.usage?.totalCostUsd).toBeCloseTo(0.0586, 3);
  });

  it("collects assistant texts", async () => {
    const trace = await parseTraceFile(streamFixture);
    expect(trace.assistantTexts).toContain("4");
  });
});
