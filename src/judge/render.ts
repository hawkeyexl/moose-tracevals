/**
 * Render a trace into judge-readable text. Session files can be tens of MB,
 * so every block is capped and the whole digest is bounded by a head/tail
 * window — the opening (instructions, intent) and the ending (outcome) matter
 * most for adherence judging.
 *
 * Given an eval plan, only the turns that plan's artifact was governing are
 * rendered (ADR 01015). That is both the correct evidence to judge against and
 * a large cut in tokens: a skill's window is usually a fraction of a session.
 *
 * This is also the only place trace content is turned into text bound for a
 * third-party API, so it is where redaction happens (ADR 01020). Every block is
 * scrubbed *before* it is clipped, so truncation can never bisect a secret and
 * leave a usable prefix behind.
 */
import type { Trace, TraceEvent } from "../trace/types.js";
import type { EvalPlan } from "../core/plan.js";
import { windowFor } from "../graders/util.js";
import { makeRedactor } from "./redact.js";

export interface RenderOptions {
  /** Per-block character cap (messages, tool inputs). */
  maxBlockChars?: number;
  /** Whole-digest character cap; overflow keeps head and tail. */
  maxTotalChars?: number;
  /**
   * Extra redaction patterns, applied on top of the built-in shapes rather
   * than instead of them. Sources are compiled with the `g` flag.
   */
  redact?: string[];
}

const DEFAULTS: Required<RenderOptions> = {
  maxBlockChars: 2_000,
  maxTotalChars: 150_000,
  redact: [],
};

export function renderTrace(
  trace: Trace,
  options: RenderOptions = {},
  plan?: EvalPlan,
): string {
  const { maxBlockChars, maxTotalChars, redact } = { ...DEFAULTS, ...options };
  const scrub = makeRedactor(redact);
  // Redact, then truncate. The other order would let a cap land mid-secret and
  // ship the surviving prefix.
  const clip = (text: string, max: number): string => {
    const safe = scrub(text);
    if (safe.length <= max) return safe;
    return `${safe.slice(0, max)} [... truncated ${safe.length - max} chars ...]`;
  };
  const window = plan === undefined ? undefined : windowFor(trace, plan);
  // Project rules govern the whole session, so their digest is the session's —
  // byte-identical to an unscoped render, and cached as such.
  const scoped =
    window !== undefined && window.scope !== "session" ? window : undefined;
  const events: TraceEvent[] = scoped?.events ?? trace.events;

  // Scrubbed too: `cwd` and a branch name are author-supplied strings, and the
  // header is as much a thing that leaves the machine as the timeline is.
  const header = scrub(
    [
      "# Session",
      `source: ${trace.source}`,
      trace.model ? `model: ${trace.model}` : undefined,
      `cwd: ${trace.cwd}`,
      trace.gitBranch ? `branch: ${trace.gitBranch}` : undefined,
      scoped
        ? `scope: ${scoped.label} — ${events.length} of ${trace.events.length} session events`
        : undefined,
      `turns: ${trace.turnCount}`,
      trace.skillInvocations.length
        ? `skills used: ${trace.skillInvocations.map((s) => s.name).join(", ")}`
        : "skills used: none",
      trace.agentSpawns.length
        ? `agents spawned: ${trace.agentSpawns.map((a) => a.subagentType).join(", ")}`
        : undefined,
      trace.subagentBranches.length
        ? `subagent transcripts: ${trace.subagentBranches
            .map((b) => `${b.agentType} (depth ${b.spawnDepth})`)
            .join(", ")}`
        : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
  );

  // Two concurrent subagents are indistinguishable under a flat `:sidechain`
  // tag, so each branch becomes a labelled block named for the subagent that
  // ran it. The header can fall outside the head/tail window below, so every
  // line keeps a short tag of its own as well. Inline and sidecar branches
  // render through this one path; a sidecar branch is named by its meta file's
  // `agentType`, which is the recorder's own statement of what ran.
  const branchTypes = new Map<string, string>();
  for (const spawn of trace.agentSpawns) {
    if (spawn.toolUseId) branchTypes.set(spawn.toolUseId, spawn.subagentType);
  }
  for (const branch of trace.subagentBranches) {
    branchTypes.set(branch.branchId, branch.agentType);
  }
  const label = (branchId: string): string =>
    branchTypes.get(branchId) ?? branchId;
  const callAt = new Map(trace.toolCalls.map((call) => [call.index, call]));

  if (scoped?.empty === true) {
    return `${header}

## Timeline
[no turns: ${scrub(scoped.reason ?? "")}]`;
  }

  const lines: string[] = [];
  let branch: string | undefined;
  for (const event of events) {
    const tag = event.branchId
      ? `:${label(event.branchId)}`
      : event.sidechain
        ? ":sidechain"
        : "";
    let line: string | undefined;
    switch (event.kind) {
      case "user":
        if (event.text) line = `[user${tag}] ${clip(event.text, maxBlockChars)}`;
        break;
      case "assistant":
        if (event.text) {
          line = `[assistant${tag}] ${clip(event.text, maxBlockChars)}`;
        }
        break;
      case "tool_call": {
        const call = callAt.get(event.index);
        const input = call ? JSON.stringify(call.input) : "";
        line = `[tool${tag}] ${event.toolName ?? call?.name ?? "?"} ${clip(input, Math.min(maxBlockChars, 500))}`;
        break;
      }
      default:
        break;
    }
    if (line === undefined) continue;
    if (event.branchId !== branch) {
      if (branch !== undefined) lines.push(`[/subagent ${label(branch)}]`);
      branch = event.branchId;
      if (branch !== undefined) {
        lines.push(`[subagent ${label(branch)} (${branch})]`);
      }
    }
    lines.push(line);
  }
  if (branch !== undefined) lines.push(`[/subagent ${label(branch)}]`);

  // One more pass over the assembled timeline. Every message and tool input
  // already went through `clip`, so this pass is the belt to that pair of
  // braces: it covers what is assembled here rather than clipped — tool names,
  // branch labels — and anything a later change adds to this loop without
  // remembering to scrub it. Redaction is idempotent, so it costs nothing.
  let timeline = scrub(lines.join("\n"));
  const budget = maxTotalChars - header.length - 64;
  if (timeline.length > budget && budget > 0) {
    const headLen = Math.floor(budget * 0.6);
    const tailLen = budget - headLen;
    const omitted = timeline.length - headLen - tailLen;
    timeline = `${timeline.slice(0, headLen)}\n[... truncated ${omitted} chars of transcript ...]\n${timeline.slice(-tailLen)}`;
  }

  return `${header}\n\n## Timeline\n${timeline}`;
}
