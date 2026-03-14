/**
 * Discover eval sources: .md files with `evals` in frontmatter,
 * and standalone .yaml/.yml eval spec files in evals/ directories.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const EVAL_EXTENSIONS = [".yaml", ".yml"];
const ARTIFACT_EXTENSIONS = [".md", ".mdx"];
const IGNORE_DIRS = ["node_modules", ".git", "dist", ".claude", "eval-results"];

export interface DiscoveredEvalSource {
  /** Absolute path to the file */
  file: string;
  /** "frontmatter" if evals are in the file's frontmatter, "standalone" if a dedicated YAML eval spec */
  source: "frontmatter" | "standalone";
}

/**
 * Recursively discover all eval sources under the given path.
 *
 * Finds:
 *  - .md files whose YAML frontmatter contains `metadata.evals`
 *  - .yaml/.yml files inside directories named `evals/`
 *
 * If path points to a single file, checks that file only.
 */
export async function discoverEvalSpecs(targetPath: string): Promise<DiscoveredEvalSource[]> {
  const resolved = resolve(targetPath);
  const info = await stat(resolved);

  if (info.isFile()) {
    return checkSingleFile(resolved);
  }

  if (info.isDirectory()) {
    return walkDir(resolved);
  }

  return [];
}

async function checkSingleFile(filePath: string): Promise<DiscoveredEvalSource[]> {
  if (EVAL_EXTENSIONS.some((ext) => filePath.endsWith(ext))) {
    return [{ file: filePath, source: "standalone" }];
  }
  if (ARTIFACT_EXTENSIONS.some((ext) => filePath.endsWith(ext))) {
    if (await hasFrontmatterEvals(filePath)) {
      return [{ file: filePath, source: "frontmatter" }];
    }
  }
  return [];
}

async function walkDir(dir: string): Promise<DiscoveredEvalSource[]> {
  const results: DiscoveredEvalSource[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORE_DIRS.includes(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await walkDir(fullPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      // Standalone YAML eval specs inside evals/ directories
      const inEvalsDir = dir.endsWith("/evals") || dir.endsWith("\\evals");
      if (inEvalsDir && EVAL_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        results.push({ file: fullPath, source: "standalone" });
        continue;
      }

      // .md files with evals in frontmatter
      if (ARTIFACT_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        if (await hasFrontmatterEvals(fullPath)) {
          results.push({ file: fullPath, source: "frontmatter" });
        }
      }
    }
  }

  return results;
}

/**
 * Quick check: does this .md file have `metadata.evals` in its YAML frontmatter?
 * Reads only the frontmatter portion to avoid loading full file content.
 */
async function hasFrontmatterEvals(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf-8");
    if (!content.startsWith("---")) return false;

    const endIndex = content.indexOf("\n---", 3);
    if (endIndex === -1) return false;

    const frontmatter = content.slice(0, endIndex + 4);
    // Quick string check: evals nested under metadata
    return /^\s+evals\s*:/m.test(frontmatter);
  } catch {
    return false;
  }
}
