/**
 * Auto-extract testable criteria from artifact files
 * (SKILL.md, agent definitions, AGENTS.md/CLAUDE.md, spec files).
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { ArtifactType, ExtractedCriteria, CriteriaOverrides } from "./types.js";

/**
 * Extract criteria from the artifact referenced by an eval spec.
 * The evalSpecDir is used to resolve relative artifact paths.
 */
export async function extractCriteria(
  artifactType: ArtifactType,
  artifactPath: string,
  evalSpecDir: string
): Promise<ExtractedCriteria> {
  const resolvedPath = resolve(evalSpecDir, artifactPath);
  const content = await readFile(resolvedPath, "utf-8");

  switch (artifactType) {
    case "skill":
      return extractFromSkill(content);
    case "agent":
      return extractFromAgent(content);
    case "project-rules":
      return extractFromProjectRules(content);
    case "spec":
      return extractFromSpec(content);
  }
}

/**
 * Merge extracted criteria with user-provided overrides.
 * When overrides are provided for a section, they replace the auto-extracted values.
 */
export function applyCriteriaOverrides(
  extracted: ExtractedCriteria,
  overrides?: CriteriaOverrides
): ExtractedCriteria {
  if (!overrides) return extracted;

  return {
    ...extracted,
    ...(overrides.entry ? { entry: overrides.entry } : {}),
    ...(overrides.exit ? { exit: overrides.exit } : {}),
    ...(overrides.requirements ? { requirements: overrides.requirements } : {}),
    ...(overrides.acceptance_criteria ? { acceptance_criteria: overrides.acceptance_criteria } : {}),
  };
}

// ── Skill extraction ─────────────────────────────────────────────

function extractFromSkill(content: string): ExtractedCriteria {
  const result: ExtractedCriteria = {};

  // Extract frontmatter description as trigger
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const descMatch = fmMatch[1].match(/description:\s*['"]?(.*?)['"]?\s*$/m);
    if (descMatch) {
      result.trigger_description = descMatch[1].trim();
    }
  }

  // Entry criteria
  result.entry = extractSection(content, "Entry Criteria", "entry criteria");

  // Exit criteria
  result.exit = extractSection(content, "Exit Criteria", "exit criteria");

  // Process steps
  result.process_steps = extractSection(content, "Process Steps", "Process", "Workflow", "Steps");

  return result;
}

// ── Agent extraction ─────────────────────────────────────────────

function extractFromAgent(content: string): ExtractedCriteria {
  const result: ExtractedCriteria = {};

  // Constraints
  result.constraints = extractSection(content, "Constraints");

  // Quality criteria
  result.quality_criteria = extractSection(content, "Quality criteria", "Quality Criteria");

  // Escalation rules
  result.escalation_rules = extractSection(content, "Escalation rules", "Escalation Rules", "Escalation");

  // Capabilities
  result.capabilities = extractSection(content, "Capabilities");

  // Tools from frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const toolsMatch = fmMatch[1].match(/tools:\s*\[(.*?)\]/);
    if (toolsMatch) {
      result.tools = toolsMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, ""));
    }
  }

  // Tools from section
  if (!result.tools?.length) {
    result.tools = extractSection(content, "Tools");
  }

  return result;
}

// ── Project rules extraction ─────────────────────────────────────

function extractFromProjectRules(content: string): ExtractedCriteria {
  const result: ExtractedCriteria = {};

  // Parse all list items as rules (AGENTS.md / CLAUDE.md are typically rule lists)
  const lines = content.split("\n");
  const rules: string[] = [];
  const gates: string[] = [];
  const conventions: string[] = [];

  let currentSection = "";

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      currentSection = headingMatch[1].toLowerCase();
      continue;
    }

    const listItem = extractListItem(line);
    if (!listItem) continue;

    if (currentSection.includes("gate") || currentSection.includes("review")) {
      gates.push(listItem);
    } else if (
      currentSection.includes("convention") ||
      currentSection.includes("style") ||
      currentSection.includes("naming")
    ) {
      conventions.push(listItem);
    } else {
      rules.push(listItem);
    }
  }

  if (rules.length) result.rules = rules;
  if (gates.length) result.gates = gates;
  if (conventions.length) result.conventions = conventions;

  return result;
}

// ── Spec extraction ──────────────────────────────────────────────

function extractFromSpec(content: string): ExtractedCriteria {
  const result: ExtractedCriteria = {};

  // Requirements
  result.requirements = extractSection(content, "Requirements");

  // Acceptance criteria
  result.acceptance_criteria = extractSection(content, "Acceptance Criteria", "Acceptance criteria");

  // Differentiation
  result.differentiation = extractSection(content, "Differentiation");

  // Uncertainty markers
  const markerPattern = /\[(?:NEEDS CLARIFICATION|TODO|TBD|FIXME|QUESTION)\]/gi;
  const markers = content.match(markerPattern);
  if (markers) {
    result.uncertainty_markers = [...new Set(markers)];
  }

  // Source references from Context section
  result.source_references = extractSection(content, "Context", "Sources", "References");

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Extract list items and table rows from a markdown section.
 * Searches for any of the given heading names (case-insensitive).
 */
function extractSection(content: string, ...headingNames: string[]): string[] {
  const items: string[] = [];

  for (const name of headingNames) {
    // Match heading at any level (##, ###, ####)
    const pattern = new RegExp(
      `^#{1,4}\\s+${escapeRegex(name)}\\s*$`,
      "im"
    );
    const match = content.match(pattern);
    if (!match || match.index === undefined) continue;

    // Get content from after heading to next heading of same or higher level
    const afterHeading = content.slice(match.index + match[0].length);
    const headingLevel = match[0].match(/^(#+)/)?.[1].length ?? 2;

    // Find next heading of same or higher level
    const nextHeadingPattern = new RegExp(`^#{1,${headingLevel}}\\s+`, "m");
    const nextMatch = afterHeading.match(nextHeadingPattern);
    const sectionContent = nextMatch && nextMatch.index !== undefined
      ? afterHeading.slice(0, nextMatch.index)
      : afterHeading;

    // Extract list items
    for (const line of sectionContent.split("\n")) {
      const item = extractListItem(line);
      if (item) items.push(item);

      // Extract table rows (skip header/separator)
      const tableMatch = line.match(/^\|(.+)\|$/);
      if (tableMatch && !line.includes("---")) {
        const cells = tableMatch[1]
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        if (cells.length > 0 && !cells[0].toLowerCase().includes("criterion")) {
          items.push(cells.join(" — "));
        }
      }
    }

    if (items.length > 0) break; // Found content, stop searching alternate names
  }

  return items;
}

function extractListItem(line: string): string | null {
  // Matches: - item, * item, 1. item, - [ ] item, - [x] item
  const match = line.match(/^\s*(?:[-*]|\d+\.)\s+(?:\[[ x]\]\s+)?(.+)/);
  return match ? match[1].trim() : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
