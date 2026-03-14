/**
 * diff-check grader: Verify file changes match expectations.
 */

import type { Criterion, TrialContext, GraderResult } from "../../types.js";

export async function graderDiffCheck(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const scope = config.scope as string | undefined;
  const expect = config.expect as string | undefined; // "unchanged" | "changed" | "created" | "deleted"
  const files = config.files as string[] | undefined;

  const evidence: Record<string, unknown> = {};
  let pass = true;
  const reasons: string[] = [];

  if (expect === "unchanged") {
    if (files) {
      // Check specific files are unchanged
      for (const file of files) {
        const before = context.workspace_before.get(file);
        const after = context.workspace_after.get(file);

        if (before === undefined && after === undefined) {
          // File didn't exist before or after — that's unchanged
          continue;
        }
        if (before !== after) {
          pass = false;
          reasons.push(`File "${file}" was modified`);
          evidence[file] = { changed: true };
        }
      }
    } else if (scope === "code_blocks") {
      // Check that code blocks in files are unchanged
      for (const [file, beforeContent] of context.workspace_before) {
        const afterContent = context.workspace_after.get(file);
        if (!afterContent) continue;

        const beforeBlocks = extractCodeBlocks(beforeContent);
        const afterBlocks = extractCodeBlocks(afterContent);

        if (beforeBlocks.length !== afterBlocks.length) {
          pass = false;
          reasons.push(`File "${file}": code block count changed (${beforeBlocks.length} → ${afterBlocks.length})`);
          continue;
        }

        for (let i = 0; i < beforeBlocks.length; i++) {
          if (beforeBlocks[i] !== afterBlocks[i]) {
            pass = false;
            reasons.push(`File "${file}": code block ${i + 1} was modified`);
          }
        }
      }
    } else {
      // Check all files unchanged
      for (const [file, beforeContent] of context.workspace_before) {
        const afterContent = context.workspace_after.get(file);
        if (beforeContent !== afterContent) {
          pass = false;
          reasons.push(`File "${file}" was modified`);
        }
      }
    }
  } else if (expect === "changed") {
    if (files) {
      for (const file of files) {
        const before = context.workspace_before.get(file);
        const after = context.workspace_after.get(file);
        if (before === after) {
          pass = false;
          reasons.push(`File "${file}" was NOT modified (expected change)`);
        }
      }
    }
  } else if (expect === "created") {
    if (files) {
      for (const file of files) {
        const after = context.workspace_after.get(file);
        if (after === undefined) {
          pass = false;
          reasons.push(`File "${file}" was NOT created`);
        }
      }
    }
  } else if (expect === "deleted") {
    if (files) {
      for (const file of files) {
        const after = context.workspace_after.get(file);
        if (after !== undefined) {
          pass = false;
          reasons.push(`File "${file}" was NOT deleted`);
        }
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push(`All files match expectation: ${expect ?? "unchanged"}`);
  }

  return {
    name: criterion.name,
    grader: "diff-check",
    pass,
    score: pass ? 1.0 : 0.0,
    reasoning: reasons.join("; "),
    evidence,
  };
}

function extractCodeBlocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}
