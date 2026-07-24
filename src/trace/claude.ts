/**
 * Claude Code trace adapter. Parses both dialects behind one entry point:
 * session files (~/.claude/projects/<slug>/*.jsonl) and legacy `claude -p`
 * stream-json transcripts. Produces the normalized Trace model.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { detectContentFormat } from "./detect.js";
import type {
  AgentSpawn,
  FileAccess,
  SkillInvocation,
  ToolCall,
  Trace,
  TraceEvent,
} from "./types.js";

type Rec = Record<string, unknown>;

export async function parseTraceFile(filePath: string): Promise<Trace> {
  const content = await readFile(filePath, "utf-8");
  return parseTraceContent(content, resolve(filePath));
}

export function parseTraceContent(content: string, filePath: string): Trace {
  const format = detectContentFormat(content);
  const { records, unparseable } = parseLines(content);
  const trace =
    format === "claude-session"
      ? parseSession(records, filePath)
      : parseStream(records, filePath);
  if (unparseable > 0) {
    trace.warnings.push(
      `${unparseable} unparseable JSONL line(s) were skipped`,
    );
  }
  return trace;
}

function parseLines(content: string): { records: Rec[]; unparseable: number } {
  const records: Rec[] = [];
  let unparseable = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as unknown;
      if (typeof rec === "object" && rec !== null) records.push(rec as Rec);
      else unparseable += 1;
    } catch {
      unparseable += 1;
    }
  }
  return { records, unparseable };
}

/** Record types that carry no conversation content. */
const SESSION_META_TYPES = new Set([
  "queue-operation",
  "attachment",
  "last-prompt",
  "custom-title",
  "summary",
  "mode",
  "pr-link",
]);

const COMMAND_NAME_RE = /<command-name>([^<]+)<\/command-name>/;
const COMMAND_ARGS_RE = /<command-args>([^<]*)<\/command-args>/;

function newTrace(filePath: string): Trace {
  return {
    source: "claude-code",
    file: filePath,
    cwd: "",
    events: [],
    toolCalls: [],
    skillInvocations: [],
    agentSpawns: [],
    fileAccesses: [],
    userMessages: [],
    assistantTexts: [],
    turnCount: 0,
    warnings: [],
  };
}

function parseSession(records: Rec[], filePath: string): Trace {
  const trace = newTrace(filePath);
  let inputTokens = 0;
  let outputTokens = 0;
  let sawUsage = false;

  for (const rec of records) {
    const type = rec.type as string | undefined;
    const timestamp = rec.timestamp as string | undefined;
    if (timestamp) {
      trace.startedAt ??= timestamp;
      trace.endedAt = timestamp;
    }
    if (rec.sessionId) trace.sessionId ??= rec.sessionId as string;

    if (type !== undefined && SESSION_META_TYPES.has(type)) {
      trace.events.push({ kind: "meta", timestamp, raw: rec });
      continue;
    }

    const sidechain = rec.isSidechain === true;
    // cwd/gitBranch follow the latest non-sidechain message record.
    if (!sidechain && typeof rec.cwd === "string") trace.cwd = rec.cwd;
    if (!sidechain && typeof rec.gitBranch === "string") {
      trace.gitBranch = rec.gitBranch;
    }

    const message = rec.message as Rec | undefined;
    if (type === "user" && message) {
      handleUserMessage(trace, message, sidechain, timestamp, rec);
    } else if (type === "assistant" && message) {
      const usage = handleAssistantMessage(
        trace,
        message,
        sidechain,
        timestamp,
        rec,
      );
      if (usage && !sidechain) {
        inputTokens += usage.input;
        outputTokens += usage.output;
        sawUsage = true;
      }
    } else {
      trace.events.push({ kind: "system", timestamp, raw: rec });
    }
  }

  if (sawUsage) trace.usage = { inputTokens, outputTokens };
  return trace;
}

function handleUserMessage(
  trace: Trace,
  message: Rec,
  sidechain: boolean,
  timestamp: string | undefined,
  raw: Rec,
): void {
  const content = message.content;
  if (typeof content === "string") {
    trace.events.push({ kind: "user", timestamp, text: content, sidechain, raw });
    if (sidechain) return;
    const command = COMMAND_NAME_RE.exec(content);
    if (command?.[1]) {
      const invocation: SkillInvocation = {
        name: command[1].replace(/^\//, ""),
        via: "command-injection",
      };
      const args = COMMAND_ARGS_RE.exec(content)?.[1]?.trim();
      if (args) invocation.args = args;
      trace.skillInvocations.push(invocation);
    }
    trace.userMessages.push(content);
    trace.turnCount += 1;
    return;
  }
  if (Array.isArray(content)) {
    // Tool results (and mixed blocks). Text blocks alongside tool results are
    // rare; only pure text turns count as prompts.
    let hasToolResult = false;
    const texts: string[] = [];
    for (const block of content as Rec[]) {
      if (block?.type === "tool_result") hasToolResult = true;
      if (block?.type === "text" && typeof block.text === "string") {
        texts.push(block.text);
      }
    }
    if (hasToolResult) {
      trace.events.push({ kind: "tool_result", timestamp, sidechain, raw });
      return;
    }
    const text = texts.join("\n");
    trace.events.push({ kind: "user", timestamp, text, sidechain, raw });
    if (!sidechain && text) {
      trace.userMessages.push(text);
      trace.turnCount += 1;
    }
  }
}

function handleAssistantMessage(
  trace: Trace,
  message: Rec,
  sidechain: boolean,
  timestamp: string | undefined,
  raw: Rec,
): { input: number; output: number } | undefined {
  if (!sidechain && typeof message.model === "string") {
    trace.model ??= message.model;
  }
  const content = message.content;
  if (Array.isArray(content)) {
    for (const block of content as Rec[]) {
      if (block?.type === "text" && typeof block.text === "string") {
        trace.events.push({
          kind: "assistant",
          timestamp,
          text: block.text,
          sidechain,
          raw,
        });
        if (!sidechain) trace.assistantTexts.push(block.text);
      } else if (block?.type === "tool_use") {
        extractToolUse(trace, block, sidechain, timestamp);
      }
    }
  }
  const usage = message.usage as Rec | undefined;
  if (usage) {
    return {
      input: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
      output: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
    };
  }
  return undefined;
}

function extractToolUse(
  trace: Trace,
  block: Rec,
  sidechain: boolean,
  timestamp: string | undefined,
): void {
  const name = block.name as string;
  const input = (block.input as Rec) ?? {};
  const call: ToolCall = { name, input, sidechain };
  if (timestamp) call.timestamp = timestamp;
  trace.toolCalls.push(call);
  trace.events.push({
    kind: "tool_call",
    timestamp,
    toolName: name,
    sidechain,
    raw: block,
  });

  switch (name) {
    case "Skill": {
      if (typeof input.skill === "string") {
        const invocation: SkillInvocation = {
          name: input.skill,
          via: "skill-tool",
        };
        if (typeof input.args === "string" && input.args) {
          invocation.args = input.args;
        }
        trace.skillInvocations.push(invocation);
      }
      break;
    }
    case "Agent": {
      if (typeof input.subagent_type === "string") {
        const spawn: AgentSpawn = { subagentType: input.subagent_type };
        if (typeof input.description === "string") {
          spawn.description = input.description;
        }
        trace.agentSpawns.push(spawn);
      }
      break;
    }
    case "Read":
    case "Write":
    case "Edit": {
      if (typeof input.file_path === "string") {
        const op: FileAccess["op"] =
          name === "Read" ? "read" : name === "Write" ? "write" : "edit";
        trace.fileAccesses.push({ path: input.file_path, op });
      }
      break;
    }
  }
}

function parseStream(records: Rec[], filePath: string): Trace {
  const trace = newTrace(filePath);
  let inputTokens = 0;
  let outputTokens = 0;
  let sawMessageUsage = false;

  for (const rec of records) {
    const type = rec.type as string | undefined;

    if (type === "system" && (rec.subtype === "init" || !rec.subtype)) {
      if (typeof rec.cwd === "string") trace.cwd = rec.cwd;
      if (typeof rec.model === "string") trace.model = rec.model;
      if (typeof rec.session_id === "string") trace.sessionId = rec.session_id;
      trace.events.push({ kind: "system", raw: rec });
      continue;
    }

    if (type === "assistant" || type === "user") {
      const message = (rec.message as Rec | undefined) ?? rec;
      if (type === "assistant") {
        const usage = handleAssistantMessage(trace, message, false, undefined, rec);
        if (usage) {
          inputTokens += usage.input;
          outputTokens += usage.output;
          sawMessageUsage = true;
        }
      } else {
        handleUserMessage(trace, message, false, undefined, rec);
      }
      continue;
    }

    if (type === "result") {
      trace.isError = rec.is_error === true;
      if (typeof rec.num_turns === "number") trace.turnCount = rec.num_turns;
      const usage = rec.usage as Rec | undefined;
      const totalCost =
        typeof rec.total_cost_usd === "number" ? rec.total_cost_usd : undefined;
      if (usage) {
        trace.usage = {
          inputTokens:
            typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
          outputTokens:
            typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
        };
        if (totalCost !== undefined) trace.usage.totalCostUsd = totalCost;
      } else if (sawMessageUsage) {
        trace.usage = { inputTokens, outputTokens };
        if (totalCost !== undefined) trace.usage.totalCostUsd = totalCost;
      }
      trace.events.push({ kind: "meta", raw: rec });
      continue;
    }

    trace.events.push({ kind: "meta", raw: rec });
  }

  if (!trace.usage && sawMessageUsage) {
    trace.usage = { inputTokens, outputTokens };
  }
  return trace;
}
