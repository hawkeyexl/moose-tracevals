/**
 * Trace format sniffing. Session files and stream-json are both JSONL, but
 * session records carry camelCase `sessionId` (and `parentUuid` on message
 * records) while stream-json uses snake_case `session_id`.
 */
import { AgentevalsError } from "../types.js";
import type { TraceFormat } from "./types.js";

const SUPPORTED =
  "supported formats: Claude Code session files (~/.claude/projects/**.jsonl) and claude -p stream-json";

/** Detect the dialect from one JSONL line (typically the first parseable). */
export function detectFormat(line: string): TraceFormat {
  let rec: Record<string, unknown>;
  try {
    rec = JSON.parse(line) as Record<string, unknown>;
  } catch {
    throw new AgentevalsError(`trace is not JSONL (${SUPPORTED})`);
  }
  if (typeof rec !== "object" || rec === null) {
    throw new AgentevalsError(`unrecognized trace format (${SUPPORTED})`);
  }
  if ("parentUuid" in rec || "sessionId" in rec) return "claude-session";
  if ("session_id" in rec) return "claude-stream";
  throw new AgentevalsError(`unrecognized trace format (${SUPPORTED})`);
}

/**
 * Detect the dialect of a whole file's content: the first line that parses as
 * JSON decides. Throws when no line is recognizable.
 */
export function detectContentFormat(content: string): TraceFormat {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      return detectFormat(trimmed);
    } catch (err) {
      // A malformed first line shouldn't decide the format; keep scanning.
      // But an unrecognized *parsed* record is decisive enough to keep the
      // error message specific.
      if (err instanceof AgentevalsError && trimmed.startsWith("{")) {
        try {
          JSON.parse(trimmed);
          throw err;
        } catch (inner) {
          if (inner === err) throw err;
          continue;
        }
      }
      continue;
    }
  }
  throw new AgentevalsError(`empty or unrecognized trace file (${SUPPORTED})`);
}
