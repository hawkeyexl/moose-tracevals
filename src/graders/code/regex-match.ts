/**
 * regex-match grader: Verify output matches or doesn't match a pattern.
 */

import type { Criterion, TrialContext, GraderResult } from "../../types.js";

export async function graderRegexMatch(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const pattern = config.pattern as string | undefined;
  const expect = (config.expect as string) ?? "present"; // "present" | "absent"
  const scope = (config.scope as string) ?? "transcript"; // "transcript" | "files" | "output"

  if (!pattern) {
    return {
      name: criterion.name,
      grader: "regex-match",
      pass: false,
      score: 0.0,
      reasoning: "No pattern provided in grader config",
    };
  }

  const regex = new RegExp(pattern, "gi");
  let searchText = "";
  const evidence: Record<string, unknown> = { pattern, expect };

  if (scope === "files") {
    // Search in workspace files after trial
    for (const [file, content] of context.workspace_after) {
      searchText += `\n--- ${file} ---\n${content}`;
    }
  } else {
    // Search in transcript text content
    for (const msg of context.transcript) {
      if (typeof msg.content === "string") {
        searchText += "\n" + msg.content;
      }
      if (Array.isArray(msg.content)) {
        for (const block of msg.content as Array<Record<string, unknown>>) {
          if (block?.type === "text" && typeof block.text === "string") {
            searchText += "\n" + block.text;
          }
        }
      }
    }
  }

  const matches = searchText.match(regex);
  const found = matches !== null && matches.length > 0;
  const pass = expect === "present" ? found : !found;

  evidence.match_count = matches?.length ?? 0;
  if (matches && matches.length <= 5) {
    evidence.matches = matches;
  }

  return {
    name: criterion.name,
    grader: "regex-match",
    pass,
    score: pass ? 1.0 : 0.0,
    reasoning: expect === "present"
      ? found
        ? `Pattern matched ${matches!.length} time(s)`
        : `Pattern "${pattern}" not found in ${scope}`
      : found
        ? `Pattern "${pattern}" found ${matches!.length} time(s) in ${scope} (expected absent)`
        : `Pattern correctly absent from ${scope}`,
    evidence,
  };
}
