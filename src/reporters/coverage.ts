/** Coverage rendering shared by every reporter. */
import type { CoverageEntry } from "../artifacts/types.js";

/**
 * The "where" cell for one coverage entry.
 *
 * Shared rather than duplicated per reporter: this logic existed twice and the
 * copies drifted, so the markdown table interpolated an absent `path` and
 * printed the literal string "undefined" for an entry the human reporter
 * rendered correctly.
 *
 * A resolved entry usually names the file it resolved to, but not always —
 * project rules aggregate several files (`CLAUDE.md` *and* `AGENTS.md`) into one
 * entry with no single `path`. Fall through to the note, then to empty. `note`
 * is independent of `resolved` in the type, so a producer that supplies one is
 * honoured rather than having it silently dropped.
 */
export function coverageLocation(entry: CoverageEntry): string {
  if (entry.resolved) return entry.path ?? entry.note ?? "";
  return entry.note ?? `not found (${entry.tried.length} location(s) tried)`;
}
