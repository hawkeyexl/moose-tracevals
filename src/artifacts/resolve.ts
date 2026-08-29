/**
 * Deterministic artifact resolution: map every skill/agent/project-rule
 * reference in a trace to a file on disk. Trace content + filesystem lookup
 * only — no LLM guessing. Unresolved refs degrade to coverage entries and
 * warnings, never a crash (ADR 01003).
 */
import { basename, dirname, join, resolve } from "node:path";
import { homeDir } from "../trace/discover.js";
import { coverAvailability } from "./availability.js";
import { findGitRoot, findInTree, safeMtime, safeRead } from "./fs.js";
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
  /**
   * List every offered-but-unused artifact in the coverage table rather than
   * only counting them (ADR 01016). Off by default: a real roster runs to
   * hundreds of skills.
   */
  reportUnusedArtifacts?: boolean;
}

/**
 * Project-rules filenames, in the order they are checked. Different agent
 * tools use different names for the same artifact; all are read the same way.
 */
export const PROJECT_RULES_FILENAMES = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
] as const;

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
  const rulesEntry: CoverageEntry = {
    ref: "project rules",
    kind: "project-rules",
    resolved: rules.artifacts.length > 0,
    tried: rules.tried,
    ...(rules.artifacts.length === 0
      ? { note: "no CLAUDE.md or AGENTS.md found" }
      : {}),
  };
  coverage.push(rulesEntry);

  // One aggregated entry covers several files, so it has no single `path` to
  // stat; name them explicitly. Every other entry stats the file it resolved to.
  //
  // Before the roster pass, not after: staleness only has something to say
  // about rows that resolved to a file, and the roster's own offered-but-unused
  // rows never do. Annotating first also keeps these flags on the entries the
  // roster copies forward.
  await annotateStaleness(
    trace,
    coverage,
    new Map([[rulesEntry, rules.artifacts.map((a) => a.path)]]),
    warnings,
  );

  // What the session was *offered* is the other half of coverage: resolution
  // only ever sees what it used (ADR 01016).
  const availability = coverAvailability(trace, coverage, {
    ...(options.reportUnusedArtifacts !== undefined
      ? { listUnused: options.reportUnusedArtifacts }
      : {}),
  });

  return {
    artifacts,
    coverage: availability.coverage,
    availability: availability.report,
    warnings,
  };
}

// ── Staleness ────────────────────────────────────────────────────

/**
 * Flag every resolved artifact whose file is newer than the session (ADR
 * 01021). Evals are read from the artifact *as it is now* while the session
 * followed it *as it was then*, so editing a SKILL.md after a session grades
 * that session against instructions it never saw.
 *
 * A heuristic, and deliberately a soft one: mtime is not content identity, a
 * fresh clone rewrites every mtime, and an unreadable mtime says nothing. It
 * produces a coverage flag and one warning — never an eval outcome, never an
 * exit code.
 */
async function annotateStaleness(
  trace: Trace,
  coverage: CoverageEntry[],
  extraPaths: Map<CoverageEntry, string[]>,
  warnings: string[],
): Promise<void> {
  // No session end means no ground to compare against, and guessing one would
  // manufacture a warning out of no evidence.
  if (trace.endedAt === undefined) return;
  const endedAt = Date.parse(trace.endedAt);
  if (!Number.isFinite(endedAt)) return;

  const staleRefs: string[] = [];
  for (const entry of coverage) {
    if (!entry.resolved) continue;
    const paths = extraPaths.get(entry) ?? (entry.path ? [entry.path] : []);
    if (paths.length === 0) continue;

    let newest: string | undefined;
    for (const path of paths) {
      const mtime = await safeMtime(path);
      if (mtime === null) continue;
      if (newest === undefined || mtime > newest) newest = mtime;
    }
    if (newest === undefined) continue;

    entry.modifiedAt = newest;
    entry.stale = Date.parse(newest) > endedAt;
    if (entry.stale) staleRefs.push(entry.ref);
  }

  if (staleRefs.length > 0) {
    // One warning, not one per artifact: a fresh checkout flags everything, and
    // a wall of identical lines is how a real signal gets tuned out.
    warnings.push(
      `${staleRefs.length} artifact(s) were modified after the session ended ` +
        `(${staleRefs.join(", ")}) — their evals may not be the instructions ` +
        `this session followed. mtime is a heuristic, not content identity.`,
    );
  }
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
    for (const filename of PROJECT_RULES_FILENAMES) {
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

// Filesystem helpers live in ./fs.js, shared with static discovery.
