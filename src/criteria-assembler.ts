/**
 * Criteria assembler — extracts criteria from artifacts via frontmatter or body,
 * handles --detect-criteria merge, and writes back updated frontmatter.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import yaml from "js-yaml";
import { extractCriteria } from "./extractor.js";
import type { ResolvedArtifact, AssembledCriterion, ArtifactType, ExtractedCriteria } from "./types.js";

/**
 * Assemble all criteria from resolved artifacts.
 */
export async function assembleCriteria(
  artifacts: ResolvedArtifact[],
  detectCriteria: boolean
): Promise<AssembledCriterion[]> {
  const all: AssembledCriterion[] = [];

  for (const artifact of artifacts) {
    const criteria = await assembleCriteriaForArtifact(artifact, detectCriteria);
    all.push(...criteria);
  }

  return all;
}

async function assembleCriteriaForArtifact(
  artifact: ResolvedArtifact,
  detectCriteria: boolean
): Promise<AssembledCriterion[]> {
  const frontmatterCriteria = extractFrontmatterCriteria(artifact.content);
  const hasFrontmatter = frontmatterCriteria.length > 0;

  if (hasFrontmatter && !detectCriteria) {
    // Case 2: Use frontmatter only
    console.log(`  Using frontmatter criteria for ${artifact.name} (${frontmatterCriteria.length} criteria)`);
    return frontmatterCriteria.map((text) => ({
      text,
      source_artifact: artifact.name,
      category: "frontmatter",
      origin: "frontmatter" as const,
    }));
  }

  // Extract from body
  const bodyCriteria = await extractBodyCriteria(artifact);

  if (detectCriteria) {
    // Case 3: Merge body + frontmatter, write back
    const merged = mergeCriteria(frontmatterCriteria, bodyCriteria);
    const newCount = merged.length - frontmatterCriteria.length;

    if (newCount > 0) {
      console.log(`  Detected ${bodyCriteria.length} criteria from body for ${artifact.name}, merged ${newCount} new into frontmatter`);
      await writeFrontmatterCriteria(artifact.resolved_path, merged);
    } else {
      console.log(`  Detected ${bodyCriteria.length} criteria from body for ${artifact.name}, no new criteria to merge`);
    }

    return merged.map((text) => ({
      text,
      source_artifact: artifact.name,
      category: categorizeText(text),
      origin: frontmatterCriteria.includes(text) ? "frontmatter" as const : "body-extraction" as const,
    }));
  }

  // Case 4: No frontmatter, extract from body and save
  if (bodyCriteria.length > 0) {
    console.log(`  No frontmatter criteria for ${artifact.name}, extracting from body (${bodyCriteria.length} found)`);
    await writeFrontmatterCriteria(artifact.resolved_path, bodyCriteria);
    console.log(`  Saved ${bodyCriteria.length} detected criteria to frontmatter in ${artifact.name}`);
  } else {
    console.log(`  No criteria found for ${artifact.name}`);
  }

  return bodyCriteria.map((text) => ({
    text,
    source_artifact: artifact.name,
    category: categorizeText(text),
    origin: "body-extraction" as const,
  }));
}

// ── Frontmatter parsing ──────────────────────────────────────────

function extractFrontmatterCriteria(content: string): string[] {
  if (!content.startsWith("---")) return [];

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) return [];

  const fmRaw = content.slice(4, endIndex);
  try {
    const fm = yaml.load(fmRaw) as Record<string, unknown>;
    if (!fm || typeof fm !== "object") return [];

    const metadata = fm.metadata as Record<string, unknown> | undefined;
    if (!metadata || typeof metadata !== "object") return [];

    const evals = metadata.evals as Record<string, unknown> | undefined;
    if (!evals || typeof evals !== "object") return [];

    const criteria = evals.criteria;
    if (!Array.isArray(criteria)) return [];

    return criteria.filter((c): c is string => typeof c === "string" && c.length > 0);
  } catch {
    return [];
  }
}

// ── Body extraction ──────────────────────────────────────────────

async function extractBodyCriteria(artifact: ResolvedArtifact): Promise<string[]> {
  try {
    const extracted = await extractCriteria(artifact.type, artifact.resolved_path, dirname(artifact.resolved_path));
    return flattenExtracted(extracted);
  } catch {
    return [];
  }
}

function flattenExtracted(extracted: ExtractedCriteria): string[] {
  const all: string[] = [];
  const sections = [
    extracted.entry,
    extracted.exit,
    extracted.constraints,
    extracted.rules,
    extracted.conventions,
    extracted.gates,
    extracted.requirements,
    extracted.acceptance_criteria,
    extracted.quality_criteria,
    extracted.escalation_rules,
  ];

  for (const section of sections) {
    if (Array.isArray(section)) {
      all.push(...section);
    }
  }

  return all;
}

// ── Merge logic ──────────────────────────────────────────────────

function mergeCriteria(frontmatter: string[], body: string[]): string[] {
  const normalized = new Set(frontmatter.map(normalize));
  const merged = [...frontmatter];

  for (const item of body) {
    if (!normalized.has(normalize(item))) {
      merged.push(item);
      normalized.add(normalize(item));
    }
  }

  return merged;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// ── Frontmatter writing ─────────────────────────────────────────

async function writeFrontmatterCriteria(filePath: string, criteria: string[]): Promise<void> {
  const content = await readFile(filePath, "utf-8");

  if (!content.startsWith("---")) {
    // No existing frontmatter — create it
    const newFm = yaml.dump({
      metadata: { evals: { criteria } },
    }, { lineWidth: -1 });
    const newContent = `---\n${newFm}---\n${content}`;
    await writeFile(filePath, newContent, "utf-8");
    return;
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) return;

  const fmRaw = content.slice(4, endIndex);
  const body = content.slice(endIndex + 4);

  try {
    const fm = yaml.load(fmRaw) as Record<string, unknown> ?? {};

    // Ensure metadata.evals.criteria exists
    if (!fm.metadata || typeof fm.metadata !== "object") {
      fm.metadata = {};
    }
    const metadata = fm.metadata as Record<string, unknown>;
    if (!metadata.evals || typeof metadata.evals !== "object") {
      metadata.evals = {};
    }
    const evals = metadata.evals as Record<string, unknown>;
    evals.criteria = criteria;

    const newFm = yaml.dump(fm, { lineWidth: -1 });
    const newContent = `---\n${newFm}---\n${body}`;
    await writeFile(filePath, newContent, "utf-8");
  } catch {
    // Failed to update frontmatter
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function categorizeText(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("must") || lower.includes("require") || lower.includes("shall")) return "requirement";
  if (lower.includes("should not") || lower.includes("must not") || lower.includes("never")) return "constraint";
  if (lower.includes("output") || lower.includes("create") || lower.includes("produce")) return "exit";
  if (lower.includes("input") || lower.includes("source") || lower.includes("provided")) return "entry";
  return "rule";
}
