/**
 * tool-usage grader: Verify specific tools were or weren't used.
 */

import type { Criterion, TrialContext, GraderResult } from "../../types.js";

export async function graderToolUsage(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const expectedTools = config.expected_tools as string[] | undefined;
  const forbiddenTools = config.forbidden_tools as string[] | undefined;
  const expect = (config.expect as string) ?? "used"; // "used" | "not_used"

  // Collect all tool names used in transcript
  const usedTools = new Set<string>();

  for (const msg of context.transcript) {
    if (msg.tool_use?.name) {
      usedTools.add(msg.tool_use.name);
    }

    if (Array.isArray(msg.content)) {
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (block?.type === "tool_use" && typeof block.name === "string") {
          usedTools.add(block.name);
        }
      }
    }
  }

  const evidence: Record<string, unknown> = {
    tools_used: [...usedTools],
  };

  let pass = true;
  const reasons: string[] = [];

  // Check expected tools were used
  if (expectedTools) {
    for (const tool of expectedTools) {
      const wasUsed = usedTools.has(tool) ||
        [...usedTools].some((u) => u.toLowerCase() === tool.toLowerCase());
      if (expect === "used" && !wasUsed) {
        pass = false;
        reasons.push(`Expected tool "${tool}" was not used`);
      }
      if (expect === "not_used" && wasUsed) {
        pass = false;
        reasons.push(`Tool "${tool}" was used (expected not used)`);
      }
    }
  }

  // Check forbidden tools were not used
  if (forbiddenTools) {
    for (const tool of forbiddenTools) {
      const wasUsed = usedTools.has(tool) ||
        [...usedTools].some((u) => u.toLowerCase() === tool.toLowerCase());
      if (wasUsed) {
        pass = false;
        reasons.push(`Forbidden tool "${tool}" was used`);
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push("Tool usage matches expectations");
  }

  return {
    name: criterion.name,
    grader: "tool-usage",
    pass,
    score: pass ? 1.0 : 0.0,
    reasoning: reasons.join("; "),
    evidence,
  };
}
