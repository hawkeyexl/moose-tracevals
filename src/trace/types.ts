/**
 * Normalized trace model. Every adapter maps its on-disk format into this
 * shape; the engine, graders, and judge consume only this model. The
 * TraceSource union is the seam for future adapters (ADR 01003).
 */

export type TraceSource = "claude-code";

/** On-disk dialects the Claude adapter understands. */
export type TraceFormat = "claude-session" | "claude-stream";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  timestamp?: string;
  /** True when the call happened inside a subagent branch. */
  sidechain: boolean;
}

export interface SkillInvocation {
  /** Skill name; plugin skills keep their `plugin:skill` form. */
  name: string;
  via: "skill-tool" | "command-injection";
  args?: string;
}

export interface AgentSpawn {
  subagentType: string;
  description?: string;
}

export interface FileAccess {
  path: string;
  op: "read" | "write" | "edit";
}

export interface TraceUsage {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd?: number;
}

export interface TraceEvent {
  kind: "user" | "assistant" | "tool_call" | "tool_result" | "system" | "meta";
  timestamp?: string;
  text?: string;
  toolName?: string;
  sidechain?: boolean;
  raw: Record<string, unknown>;
}

export interface Trace {
  source: TraceSource;
  /** Absolute path of the trace file. */
  file: string;
  sessionId?: string;
  /** Working directory the session ran in; artifact lookup starts here. */
  cwd: string;
  gitBranch?: string;
  model?: string;
  startedAt?: string;
  endedAt?: string;
  events: TraceEvent[];
  toolCalls: ToolCall[];
  skillInvocations: SkillInvocation[];
  agentSpawns: AgentSpawn[];
  fileAccesses: FileAccess[];
  /** Non-sidechain user prompts (tool results excluded). */
  userMessages: string[];
  /** Non-sidechain assistant text blocks. */
  assistantTexts: string[];
  usage?: TraceUsage;
  /** Non-sidechain user prompts — a proxy for conversation turns. */
  turnCount: number;
  isError?: boolean;
  /** Degradation notes surfaced in the report; never fatal. */
  warnings: string[];
}
