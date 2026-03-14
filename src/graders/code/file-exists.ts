/**
 * file-exists grader: Verify expected files were created/not created.
 */

import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { Criterion, TrialContext, GraderResult } from "../../types.js";

export async function graderFileExists(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const files = config.files as string[] | undefined;
  const expect = (config.expect as string) ?? "exists"; // "exists" | "not_exists"

  if (!files || files.length === 0) {
    return {
      name: criterion.name,
      grader: "file-exists",
      pass: false,
      score: 0.0,
      reasoning: "No files specified in grader config",
    };
  }

  const results: Record<string, boolean> = {};
  let allMatch = true;

  for (const file of files) {
    const fullPath = resolve(context.cwd, file);
    let exists = false;

    // Check workspace_after snapshot first
    if (context.workspace_after.has(file)) {
      exists = true;
    } else {
      // Fall back to filesystem check
      try {
        await access(fullPath);
        exists = true;
      } catch {
        exists = false;
      }
    }

    results[file] = exists;
    const matches = expect === "exists" ? exists : !exists;
    if (!matches) allMatch = false;
  }

  const failedFiles = Object.entries(results)
    .filter(([, exists]) => (expect === "exists" ? !exists : exists))
    .map(([file]) => file);

  return {
    name: criterion.name,
    grader: "file-exists",
    pass: allMatch,
    score: allMatch ? 1.0 : (files.length - failedFiles.length) / files.length,
    reasoning: allMatch
      ? `All ${files.length} files match expectation (${expect})`
      : `Files not matching expectation (${expect}): ${failedFiles.join(", ")}`,
    evidence: { results, expect },
  };
}
