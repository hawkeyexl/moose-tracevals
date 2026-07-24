/**
 * Deterministic artifact resolution: map every skill/agent/project-rule
 * reference in a trace to a file on disk. Trace content + filesystem lookup
 * only — no LLM guessing. Unresolved refs degrade to coverage entries and
 * warnings, never a crash (ADR 01003).
 */
import { access, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homeDir } from "../trace/discover.js";
import type { Trace } from "../trace/types.js";
import type {
  CoverageEntry,
  ResolvedArtifact,
  ResolvedArtifacts,
} from "./types.js";

export interface ResolveOptions {
  /** Overrides the trace's recorded cwd (for deleted workspaces). */
  projectDir?: string;
  /** Ceiling for the parent-directory walk; defaults to the git root. */
  projectRoot?: string;
  env?: Record<string, string | undefined>;
}

/** Agents that ship with Claude Code and have no definition file on disk. */
const BUILTIN_AGENTS = new Set([
  "general-purpose",
  "claude",
  "Explore",
  "Plan",
  "statusline-setup",
  "fork",
]);

export async function resolveArtifacts(
  trace: Trace,
  options: ResolveOptions = {},
): Promise<ResolvedArtifacts> {
  const projectDir = resolve(options.projectDir ?? trace.cwd);
  const home = homeDir(options.env);
  const projectRoot = resolve(
    options.projectRoot ?? (await findGitRoot(projectDir)) ?? projectDir,
  );

  const artifacts: ResolvedArtifact[] = [];
  const coverage: CoverageEntry[] = [];
  const warnings: string[] = [];
  const seenPaths = new Set<string>();
  const seenRefs = new Set<string>();

  const add = (artifact: ResolvedArtifact): void => {
    if (seenPaths.has(artifact.path)) return;
    seenPaths.add(artifact.path);
    artifacts.push(artifact);
  };

  for (const invocation of trace.skillInvocations) {
    const refKey = `skill:${invocation.name}`;
    if (seenRefs.has(refKey)) continue;
    seenRefs.add(refKey);
    const { artifact, tried } = await resolveSkill(
      invocation.name,
      projectDir,
      home,
    );
    if (artifact) {
      add(artifact);
      coverage.push({
        ref: invocation.name,
        kind: "skill",
        resolved: true,
        path: artifact.path,
        tried,
      });
    } else {
      coverage.push({ ref: invocation.name, kind: "skill", resolved: false, tried });
      warnings.push(
        `skill "${invocation.name}" was invoked but no SKILL.md was found (${tried.length} location(s) tried)`,
      );
    }
  }

  for (const spawn of trace.agentSpawns) {
    const refKey = `agent:${spawn.subagentType}`;
    if (seenRefs.has(refKey)) continue;
    seenRefs.add(refKey);
    if (BUILTIN_AGENTS.has(spawn.subagentType)) {
      coverage.push({
        ref: spawn.subagentType,
        kind: "agent",
        resolved: false,
        tried: [],
        note: "built-in agent (no definition file)",
      });
      continue;
    }
    const { artifact, tried } = await resolveAgent(
      spawn.subagentType,
      projectDir,
      home,
    );
    if (artifact) {
      add(artifact);
      coverage.push({
        ref: spawn.subagentType,
        kind: "agent",
        resolved: true,
        path: artifact.path,
        tried,
      });
    } else {
      coverage.push({
        ref: spawn.subagentType,
        kind: "agent",
        resolved: false,
        tried,
      });
      warnings.push(
        `agent "${spawn.subagentType}" was spawned but no definition file was found (${tried.length} location(s) tried)`,
      );
    }
  }

  const rules = await resolveProjectRules(projectDir, projectRoot);
  for (const rule of rules.artifacts) add(rule);
  coverage.push({
    ref: "project rules",
    kind: "project-rules",
    resolved: rules.artifacts.length > 0,
    tried: rules.tried,
    ...(rules.artifacts.length === 0
      ? { note: "no CLAUDE.md or AGENTS.md found" }
      : {}),
  });

  return { artifacts, coverage, warnings };
}

// ── Skills ───────────────────────────────────────────────────────

async function resolveSkill(
  name: string,
  projectDir: string,
  home: string,
): Promise<{ artifact: ResolvedArtifact | null; tried: string[] }> {
  const tried: string[] = [];
  // `plugin:skill` refs look up the skill by its short name inside the
  // user plugin store; plain refs check project dirs then the user store.
  const [pluginName, shortName] = name.includes(":")
    ? (name.split(":", 2) as [string, string])
    : [null, name];

  const candidates: Array<{ path: string; origin: ResolvedArtifact["origin"] }> =
    [];
  if (pluginName === null) {
    for (const dir of ["skills", join("src", "skills"), join(".claude", "skills")]) {
      candidates.push({
        path: join(projectDir, dir, shortName, "SKILL.md"),
        origin: "project",
      });
    }
    candidates.push({
      path: join(home, ".claude", "skills", shortName, "SKILL.md"),
      origin: "user",
    });
  }

  for (const candidate of candidates) {
    tried.push(candidate.path);
    const content = await safeRead(candidate.path);
    if (content !== null) {
      return {
        artifact: {
          name,
          type: "skill",
          path: candidate.path,
          content,
          origin: candidate.origin,
        },
        tried,
      };
    }
  }

  // Plugin store: ~/.claude/plugins/**/skills/<shortName>/SKILL.md. The store
  // layout varies (marketplace caches nest deeper), so search recursively.
  const pluginRoot = join(home, ".claude", "plugins");
  tried.push(join(pluginRoot, "**", "skills", shortName, "SKILL.md"));
  const found = await findInTree(
    pluginRoot,
    (path) =>
      basename(path) === "SKILL.md" &&
      basename(dirname(path)) === shortName &&
      (pluginName === null || path.includes(pluginName)),
  );
  if (found) {
    const content = await safeRead(found);
    if (content !== null) {
      return {
        artifact: { name, type: "skill", path: found, content, origin: "plugin" },
        tried,
      };
    }
  }

  return { artifact: null, tried };
}

// ── Agents ───────────────────────────────────────────────────────

async function resolveAgent(
  subagentType: string,
  projectDir: string,
  home: string,
): Promise<{ artifact: ResolvedArtifact | null; tried: string[] }> {
  const tried: string[] = [];
  // Plugin agents are referenced as `plugin:agent`; the file is the short name.
  const shortName = subagentType.includes(":")
    ? (subagentType.split(":", 2)[1] as string)
    : subagentType;

  const candidates: Array<{ path: string; origin: ResolvedArtifact["origin"] }> = [
    { path: join(projectDir, ".claude", "agents", `${shortName}.md`), origin: "project" },
    { path: join(projectDir, "agents", `${shortName}.md`), origin: "project" },
    { path: join(home, ".claude", "agents", `${shortName}.md`), origin: "user" },
  ];

  for (const candidate of candidates) {
    tried.push(candidate.path);
    const content = await safeRead(candidate.path);
    if (content !== null) {
      return {
        artifact: {
          name: subagentType,
          type: "agent",
          path: candidate.path,
          content,
          origin: candidate.origin,
        },
        tried,
      };
    }
  }
  return { artifact: null, tried };
}

// ── Project rules ────────────────────────────────────────────────

async function resolveProjectRules(
  projectDir: string,
  projectRoot: string,
): Promise<{ artifacts: ResolvedArtifact[]; tried: string[] }> {
  const artifacts: ResolvedArtifact[] = [];
  const tried: string[] = [];

  // Walk from the cwd up to the project root (inclusive), then check .claude/.
  const dirs: string[] = [];
  let current = projectDir;
  for (let depth = 0; depth < 32; depth += 1) {
    dirs.push(current);
    if (current === projectRoot) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  dirs.push(join(projectRoot, ".claude"));

  for (const dir of dirs) {
    for (const filename of ["CLAUDE.md", "AGENTS.md"]) {
      const path = join(dir, filename);
      tried.push(path);
      const content = await safeRead(path);
      if (content !== null) {
        artifacts.push({
          name: filename,
          type: "project-rules",
          path,
          content,
          origin: "project",
        });
      }
    }
  }
  return { artifacts, tried };
}

// ── Helpers ──────────────────────────────────────────────────────

async function findGitRoot(start: string): Promise<string | null> {
  let current = resolve(start);
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      await access(join(current, ".git"));
      return current;
    } catch {
      // keep walking
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

async function findInTree(
  root: string,
  match: (path: string) => boolean,
): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true, recursive: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath ?? root, entry.name);
    if (match(full)) return full;
  }
  return null;
}

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}
