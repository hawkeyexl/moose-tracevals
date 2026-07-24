/**
 * Render a trace into judge-readable text. Session files can be tens of MB,
 * so every block is capped and the whole digest is bounded by a head/tail
 * window — the opening (instructions, intent) and the ending (outcome) matter
 * most for adherence judging.
 */
import type { Trace } from "../trace/types.js";

export interface RenderOptions {
  /** Per-block character cap (messages, tool inputs). */
  maxBlockChars?: number;
  /** Whole-digest character cap; overflow keeps head and tail. */
  maxTotalChars?: number;
}

const DEFAULTS: Required<RenderOptions> = {
  maxBlockChars: 2_000,
  maxTotalChars: 150_000,
};

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)} [... truncated ${text.length - max} chars ...]`;
}

export function renderTrace(trace: Trace, options: RenderOptions = {}): string {
  const { maxBlockChars, maxTotalChars } = { ...DEFAULTS, ...options };

  const header = [
    "# Session",
    `source: ${trace.source}`,
    trace.model ? `model: ${trace.model}` : undefined,
    `cwd: ${trace.cwd}`,
    trace.gitBranch ? `branch: ${trace.gitBranch}` : undefined,
    `turns: ${trace.turnCount}`,
    trace.skillInvocations.length
      ? `skills used: ${trace.skillInvocations.map((s) => s.name).join(", ")}`
      : "skills used: none",
    trace.agentSpawns.length
      ? `agents spawned: ${trace.agentSpawns.map((a) => a.subagentType).join(", ")}`
      : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  const lines: string[] = [];
  let toolIndex = 0;
  for (const event of trace.events) {
    const tag = event.sidechain ? ":sidechain" : "";
    switch (event.kind) {
      case "user":
        if (event.text) lines.push(`[user${tag}] ${clip(event.text, maxBlockChars)}`);
        break;
      case "assistant":
        if (event.text) {
          lines.push(`[assistant${tag}] ${clip(event.text, maxBlockChars)}`);
        }
        break;
      case "tool_call": {
        const call = trace.toolCalls[toolIndex];
        toolIndex += 1;
        const input = call ? JSON.stringify(call.input) : "";
        lines.push(
          `[tool${tag}] ${event.toolName ?? call?.name ?? "?"} ${clip(input, Math.min(maxBlockChars, 500))}`,
        );
        break;
      }
      default:
        break;
    }
  }

  let timeline = lines.join("\n");
  const budget = maxTotalChars - header.length - 64;
  if (timeline.length > budget && budget > 0) {
    const headLen = Math.floor(budget * 0.6);
    const tailLen = budget - headLen;
    const omitted = timeline.length - headLen - tailLen;
    timeline = `${timeline.slice(0, headLen)}\n[... truncated ${omitted} chars of transcript ...]\n${timeline.slice(-tailLen)}`;
  }

  return `${header}\n\n## Timeline\n${timeline}`;
}
