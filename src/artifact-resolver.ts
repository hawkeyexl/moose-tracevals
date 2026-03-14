/**
 * Artifact resolver — finds skill, agent, and project-rules files on disk
 * given a parsed transcript's references.
 */

import { readFile, access, readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import type { ParsedTranscript, ResolvedArtifact, ArtifactType } from "./types.js";

/**
 * Resolve all artifacts referenced in a parsed transcript.
 */
export async function resolveArtifacts(transcript: ParsedTranscript): Promise<ResolvedArtifact[]> {
  const artifacts: ResolvedArtifact[] = [];
  const seen = new Set<string>();

  // 1. Skills
  for (const skillName of transcript.invoked_skills) {
    const resolved = await resolveSkill(skillName, transcript.cwd);
    if (resolved && !seen.has(resolved.resolved_path)) {
      seen.add(resolved.resolved_path);
      artifacts.push(resolved);
    }
  }

  // 2. Agents
  for (const agentName of [...transcript.declared_agents, ...transcript.spawned_agents]) {
    const resolved = await resolveAgent(agentName, transcript.cwd);
    if (resolved && !seen.has(resolved.resolved_path)) {
      seen.add(resolved.resolved_path);
      artifacts.push(resolved);
    }
  }

  // 3. Project rules (always check)
  const projectRules = await resolveProjectRules(transcript.cwd);
  for (const rule of projectRules) {
    if (!seen.has(rule.resolved_path)) {
      seen.add(rule.resolved_path);
      artifacts.push(rule);
    }
  }

  // 4. File-access artifacts (md files that match known patterns)
  for (const filePath of transcript.accessed_files) {
    if (seen.has(filePath)) continue;
    const artifact = classifyAccessedFile(filePath);
    if (artifact) {
      const content = await safeRead(filePath);
      if (content) {
        seen.add(filePath);
        artifacts.push({ ...artifact, content });
      }
    }
  }

  return artifacts;
}

// ── Skill resolution ─────────────────────────────────────────────

async function resolveSkill(name: string, cwd: string): Promise<ResolvedArtifact | null> {
  const searchPaths = [
    join(cwd, "skills", name, "SKILL.md"),
    join(cwd, "src", "skills", name, "SKILL.md"),
    join(cwd, ".claude", "skills", name, "SKILL.md"),
  ];

  for (const path of searchPaths) {
    const content = await safeRead(path);
    if (content) {
      return { name, type: "skill", resolved_path: path, content };
    }
  }

  // Fallback: search for SKILL.md in subdirectories matching name
  const found = await findSkillByGlob(name, cwd);
  return found;
}

async function findSkillByGlob(name: string, cwd: string): Promise<ResolvedArtifact | null> {
  const dirsToSearch = [
    join(cwd, "skills"),
    join(cwd, "src", "skills"),
    join(cwd, ".claude", "skills"),
    join(cwd, "plugins"),
  ];

  for (const dir of dirsToSearch) {
    try {
      const entries = await readdir(dir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (entry.name === "SKILL.md" && entry.isFile()) {
          const fullPath = join(entry.parentPath ?? entry.path, entry.name);
          const parentDir = basename(dirname(fullPath));
          if (parentDir.includes(name) || name.includes(parentDir)) {
            const content = await safeRead(fullPath);
            if (content) {
              return { name, type: "skill", resolved_path: fullPath, content };
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return null;
}

// ── Agent resolution ─────────────────────────────────────────────

async function resolveAgent(name: string, cwd: string): Promise<ResolvedArtifact | null> {
  // Normalize name for file lookup
  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const searchPaths = [
    join(cwd, "agents", `${cleanName}.md`),
    join(cwd, "src", "agents", `${cleanName}.md`),
    join(cwd, ".claude", "agents", `${cleanName}.md`),
    // Also try original name
    join(cwd, "agents", `${name}.md`),
    join(cwd, "src", "agents", `${name}.md`),
    join(cwd, ".claude", "agents", `${name}.md`),
  ];

  for (const path of searchPaths) {
    const content = await safeRead(path);
    if (content) {
      return { name, type: "agent", resolved_path: path, content };
    }
  }

  return null;
}

// ── Project rules resolution ─────────────────────────────────────

async function resolveProjectRules(cwd: string): Promise<ResolvedArtifact[]> {
  const rules: ResolvedArtifact[] = [];
  const candidates = [
    join(cwd, "AGENTS.md"),
    join(cwd, "CLAUDE.md"),
    join(cwd, ".claude", "AGENTS.md"),
    join(cwd, ".claude", "CLAUDE.md"),
  ];

  for (const path of candidates) {
    const content = await safeRead(path);
    if (content) {
      rules.push({
        name: basename(path),
        type: "project-rules",
        resolved_path: path,
        content,
      });
    }
  }

  return rules;
}

// ── File classification ──────────────────────────────────────────

function classifyAccessedFile(filePath: string): Omit<ResolvedArtifact, "content"> | null {
  const lower = filePath.toLowerCase();
  const name = basename(lower);

  if (name === "skill.md") {
    return { name: basename(dirname(filePath)), type: "skill", resolved_path: filePath };
  }
  if (name === "agents.md" || name === "claude.md") {
    return { name: basename(filePath), type: "project-rules", resolved_path: filePath };
  }
  if (lower.includes("/agents/") && filePath.endsWith(".md")) {
    return { name: basename(filePath, ".md"), type: "agent", resolved_path: filePath };
  }

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────

async function safeRead(path: string): Promise<string | null> {
  try {
    await access(path);
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}
