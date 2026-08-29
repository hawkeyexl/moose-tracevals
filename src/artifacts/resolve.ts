/**
 * Deterministic artifact resolution: map every skill/agent/project-rule
 * reference in a trace to a file on disk. Trace content + filesystem lookup
 * only — no LLM guessing. Unresolved refs degrade to coverage entries and
 * warnings, never a crash (ADR 01003).
 */
import { basename, dirname, join, resolve, sep } from "node:path";
import { homeDir } from "../trace/discover.js";
import { coverAvailability } from "./availability.js";
import { findGitRoot, findInTree, safeMtime, safeRead } from "./fs.js";
import { checkContent, hashFile, relPosix } from "../capture/manifest.js";
import type { SessionManifest } from "../capture/types.js";
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
  /**
   * The session manifest for this trace, when one was found (ADR 01024). It
   * makes staleness exact for the artifacts it recorded and changes nothing
   * else — no eval outcome, no exit code, no resolution decision.
   */
  manifest?: SessionManifest;
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

  /** Record a resolved skill once, however many refs reached it. */
  const addSkill = (
    name: string,
    artifact: ResolvedArtifact,
    tried: string[],
  ): void => {
    const refKey = `skill:${name}`;
    if (seenRefs.has(refKey)) return;
    seenRefs.add(refKey);
    add(artifact);
    coverage.push({
      ref: name,
      kind: "skill",
      resolved: true,
      path: artifact.path,
      tried,
    });
  };

  for (const invocation of trace.skillInvocations) {
    // A `<command-name>` injection is the slash-command mechanism, and a slash
    // command is one of three things: a `.claude/commands/*.md` file, a skill
    // surfaced under its slash form, or a built-in with no file anywhere. Only
    // the filesystem can say which, so the shape of the reference decides
    // nothing on its own (ADR 01023).
    if (invocation.via === "command-injection") {
      const refKey = `command:${invocation.name}`;
      if (seenRefs.has(refKey)) continue;
      seenRefs.add(refKey);

      const command = await resolveSlashCommand(
        invocation.name,
        projectDir,
        home,
      );
      if (command.artifact) {
        add(command.artifact);
        coverage.push({
          ref: invocation.name,
          kind: "slash-command",
          resolved: true,
          path: command.artifact.path,
          tried: command.tried,
        });
        continue;
      }

      const skill = await resolveSkill(invocation.name, projectDir, home);
      if (skill.artifact) {
        addSkill(invocation.name, skill.artifact, skill.tried);
        continue;
      }

      // No definition file in any place a command or a skill could live. Claude
      // Code's own commands (`/model`, `/compact`) have no file by design, so
      // this is reported rather than warned about — and reported as what it is
      // rather than as a skill that went missing, which is the defect ADR 01016
      // recorded. A hard-coded list of built-in names was rejected: it would go
      // stale with every Claude Code release.
      coverage.push({
        ref: invocation.name,
        kind: "slash-command",
        resolved: false,
        tried: [...command.tried, ...skill.tried],
        note: "built-in slash command, or not installed here (no definition file)",
      });
      continue;
    }

    // A `Skill` tool call is unambiguous: it names a skill.
    const refKey = `skill:${invocation.name}`;
    if (seenRefs.has(refKey)) continue;
    const { artifact, tried } = await resolveSkill(
      invocation.name,
      projectDir,
      home,
    );
    if (artifact) {
      addSkill(invocation.name, artifact, tried);
    } else {
      seenRefs.add(refKey);
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
    projectRoot,
    options.manifest,
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
 * Say, for every resolved artifact, whether it is still the one the session
 * followed. Evals are read from the artifact *as it is now* while the session
 * followed it *as it was then*, so editing a SKILL.md after a session grades
 * that session against instructions it never saw.
 *
 * Two sources of evidence, and the better one wins **only on its own question**:
 *
 *  - **A session manifest** (ADR 01024) recorded a sha256 per artifact when the
 *    session started. A digest that differs is an exact "this changed"; a digest
 *    that matches is an exact "this did not". Either one settles the row.
 *  - **mtime** (ADR 01021) is the fallback, and a soft one: it is not content
 *    identity, a fresh clone rewrites every mtime, and an unreadable mtime says
 *    nothing.
 *
 * A manifest may therefore quiet the mtime warning for an artifact it covers —
 * that is the entire point, since a checkout otherwise flags everything in CI —
 * and it may do nothing else. It never reaches an eval outcome, never moves the
 * exit code, and it cannot silence a row it has no entry for. The observation
 * itself (`modifiedAt`) is reported either way, so nothing is hidden; only the
 * conclusion drawn from it changes.
 */
async function annotateStaleness(
  trace: Trace,
  coverage: CoverageEntry[],
  extraPaths: Map<CoverageEntry, string[]>,
  warnings: string[],
  projectRoot: string,
  manifest?: SessionManifest,
): Promise<void> {
  // No session end means no ground for the *heuristic* to stand on, and
  // guessing one would manufacture a warning out of no evidence. A manifest
  // supplies its own ground, so it still has something to say here.
  const endedAt =
    trace.endedAt !== undefined ? Date.parse(trace.endedAt) : Number.NaN;
  const haveEnd = Number.isFinite(endedAt);
  if (!haveEnd && manifest === undefined) return;

  /** Refs still resting on the mtime guess. */
  const guessed: string[] = [];
  /** Refs the manifest proved changed. */
  const changed: string[] = [];

  for (const entry of coverage) {
    if (!entry.resolved) continue;
    const paths = extraPaths.get(entry) ?? (entry.path ? [entry.path] : []);
    if (paths.length === 0) continue;

    let newest: string | undefined;
    let outside = false;
    const digests = new Map<string, string>();
    for (const path of paths) {
      const mtime = await safeMtime(path);
      if (mtime !== null && (newest === undefined || mtime > newest)) {
        newest = mtime;
      }
      if (manifest === undefined) continue;
      // Keyed on the project-relative path, so the manifest still joins after
      // the repository has been checked out somewhere else. An artifact outside
      // the project — a user-level or plugin skill — has no relative path, and
      // `capture` is project-scoped, so it was never recordable in the first
      // place. That is a different sentence from "it changed" and gets one.
      const rel = relPosix(projectRoot, path);
      if (rel === null) {
        outside = true;
        continue;
      }
      const digest = await hashFile(path);
      if (digest !== null) digests.set(rel, digest);
    }
    if (newest !== undefined) entry.modifiedAt = newest;

    const check =
      manifest === undefined
        ? ({
            status: "skipped",
            reason: "no session manifest for this trace",
          } as const)
        : outside && digests.size === 0
          ? ({
              status: "skipped",
              reason:
                "outside the project root, so no session manifest could record it",
            } as const)
          : checkContent(manifest, digests);
    entry.contentCheck = check;

    if (check.status === "mismatch") {
      entry.stale = true;
      changed.push(entry.ref);
      continue;
    }
    if (check.status === "match") {
      // Exact, and it answers mtime's own question — so the guess does not run.
      entry.stale = false;
      continue;
    }
    if (!haveEnd || newest === undefined) continue;
    entry.stale = Date.parse(newest) > endedAt;
    if (entry.stale) guessed.push(entry.ref);
  }

  if (changed.length > 0) {
    warnings.push(
      `${changed.length} artifact(s) changed since the session started ` +
        `(${changed.join(", ")}) — the session manifest recorded a different ` +
        `sha256, so their evals are not the instructions this session followed.`,
    );
  }
  if (guessed.length > 0) {
    // One warning, not one per artifact: a fresh checkout flags everything, and
    // a wall of identical lines is how a real signal gets tuned out.
    warnings.push(
      `${guessed.length} artifact(s) were modified after the session ended ` +
        `(${guessed.join(", ")}) — their evals may not be the instructions ` +
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

// ── Slash commands ───────────────────────────────────────────────

/**
 * `.claude/commands/<name>.md`, in the three places Claude Code reads them:
 * the project, the user's home, and the plugin store.
 *
 * Two shapes matter and neither is guessed at. Subdirectories under
 * `commands/` **organize** rather than namespace — `commands/release/tag.md`
 * is still invoked as `/tag` — so a plain name falls back to a recursive
 * search after the direct hit misses. A `plugin:command` name is plugin
 * namespacing and is looked up in the store by its short name, exactly as
 * `resolveSkill` does for `plugin:skill`; project and user directories are not
 * checked, because a namespace is not something a local file can claim.
 */
async function resolveSlashCommand(
  name: string,
  projectDir: string,
  home: string,
): Promise<{ artifact: ResolvedArtifact | null; tried: string[] }> {
  const tried: string[] = [];
  const [pluginName, shortName] = name.includes(":")
    ? (name.split(":", 2) as [string, string])
    : [null, name];

  const made = (
    path: string,
    content: string,
    origin: ResolvedArtifact["origin"],
  ): { artifact: ResolvedArtifact; tried: string[] } => ({
    artifact: { name, type: "slash-command", path, content, origin },
    tried,
  });

  if (pluginName === null) {
    const dirs: Array<{ dir: string; origin: ResolvedArtifact["origin"] }> = [
      { dir: join(projectDir, ".claude", "commands"), origin: "project" },
      { dir: join(home, ".claude", "commands"), origin: "user" },
    ];
    for (const { dir, origin } of dirs) {
      const path = join(dir, `${shortName}.md`);
      tried.push(path);
      const content = await safeRead(path);
      if (content !== null) return made(path, content, origin);
    }
    for (const { dir, origin } of dirs) {
      tried.push(join(dir, "**", `${shortName}.md`));
      const found = await findInTree(
        dir,
        (path) => basename(path) === `${shortName}.md`,
      );
      if (found === null) continue;
      const content = await safeRead(found);
      if (content !== null) return made(found, content, origin);
    }
    return { artifact: null, tried };
  }

  const pluginRoot = join(home, ".claude", "plugins");
  tried.push(join(pluginRoot, "**", "commands", `${shortName}.md`));
  const found = await findInTree(
    pluginRoot,
    (path) =>
      basename(path) === `${shortName}.md` &&
      segments(path).includes("commands") &&
      path.includes(pluginName),
  );
  if (found !== null) {
    const content = await safeRead(found);
    if (content !== null) return made(found, content, "plugin");
  }
  return { artifact: null, tried };
}

/** Path segments, separator-normalized, for convention matching. */
function segments(path: string): string[] {
  return path.split(sep).join("/").split("/");
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
