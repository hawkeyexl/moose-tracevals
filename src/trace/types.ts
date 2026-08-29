/**
 * Normalized trace model. Every adapter maps its on-disk format into this
 * shape; the engine, graders, and judge consume only this model. The
 * TraceSource union is the seam for future adapters (ADR 01003).
 *
 * Position and branch identity are first-class (ADR 01013): every derived
 * record carries `index`, its ordinal in `trace.events`, so a list stays
 * sliceable to a window after it has been detached from the trace, and
 * sidechain records carry `branchId`, the id of the `Agent` tool call that
 * opened their subagent branch.
 *
 * Subagent turns reach the model from two on-disk shapes (ADR 01014): inline
 * `isSidechain: true` records in the session file, and sidecar transcripts in
 * `<session>/subagents/agent-<id>.jsonl`. Both land in `subagentBranches` and
 * are indistinguishable to every consumer downstream.
 */

export type TraceSource = "claude-code";

/** On-disk dialects the Claude adapter understands. */
export type TraceFormat = "claude-session" | "claude-stream";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  timestamp?: string;
  /** Ordinal of this call's own event in `trace.events`. */
  index: number;
  /** True when the call happened inside a subagent branch. */
  sidechain: boolean;
  /** Which subagent branch, when the branch could be resolved. */
  branchId?: string;
}

export interface SkillInvocation {
  /** Skill name; plugin skills keep their `plugin:skill` form. */
  name: string;
  via: "skill-tool" | "command-injection";
  args?: string;
  /** Ordinal in `trace.events` of the call or prompt that invoked the skill. */
  index: number;
  /** `tool_use` block id; absent for `<command-name>` injections. */
  toolUseId?: string;
}

export interface AgentSpawn {
  subagentType: string;
  description?: string;
  /** Ordinal of the spawning `Agent` call's event in `trace.events`. */
  index: number;
  /** `tool_use` block id — the branch id its sidechain records carry. */
  toolUseId?: string;
}

/**
 * One subagent branch: the work done under a single `Agent` spawn. Current
 * Claude Code writes those turns to a sidecar transcript beside the session
 * file; older sessions inline them as `isSidechain: true` records. `origin`
 * names which shape it came from, and nothing else downstream needs to care.
 */
export interface SubagentBranch {
  /** Branch id — the `tool_use` id of the `Agent` call that spawned it. */
  branchId: string;
  /** `subagent_type`; from the sidecar meta's `agentType` when there is one. */
  agentType: string;
  description?: string;
  /** Which on-disk shape recorded this branch's turns. */
  origin: "inline" | "sidecar";
  /** Nesting level; 1 is spawned by the main chain. Subagents spawn subagents. */
  spawnDepth: number;
  /** Ordinal of the spawning `Agent` call's event in `trace.events`. */
  spawnIndex: number;
  /**
   * Half-open ordinal span covering this branch and every branch nested under
   * it. A sidecar branch's span is exactly its own records, because they are
   * spliced in contiguously; an inline branch's span is a bounding range that
   * may enclose interleaved main-chain events, so filter by `branchId` inside
   * it when exactness matters.
   */
  startIndex: number;
  endIndex: number;
  /** Claude Code's agent id — the sidecar filename stem. Sidecar branches only. */
  agentId?: string;
  /** Agent id of the spawning subagent, when the sidecar meta records one. */
  parentAgentId?: string;
  /** Absolute path of the sidecar transcript. Sidecar branches only. */
  file?: string;
}

export interface FileAccess {
  path: string;
  op: "read" | "write" | "edit";
  /** Ordinal in `trace.events` of the tool call that made the access. */
  index: number;
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
  /** Position in `trace.events`; survives slicing the array to a window. */
  index: number;
  sidechain?: boolean;
  /** Which subagent branch, when the branch could be resolved. */
  branchId?: string;
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
  /** Every subagent branch the session recorded, inline or sidecar. */
  subagentBranches: SubagentBranch[];
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
