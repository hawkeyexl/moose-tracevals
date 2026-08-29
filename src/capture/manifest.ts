/**
 * Reading, locating, and comparing session manifests (ADR 01024).
 *
 * The consuming half. Deliberately free of any dependency on
 * `artifacts/discover.ts`: `artifacts/resolve.ts` imports this module, and
 * discovery imports resolution, so producing and consuming a manifest have to
 * live in separate files or the two would form a cycle. Building one is
 * `capture/build.ts`.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  MANIFEST_VERSION,
  type ContentCheck,
  type SessionManifest,
} from "./types.js";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** sha256 of a file's bytes, or null when it cannot be read. */
export async function hashFile(path: string): Promise<string | null> {
  try {
    // The bytes, not the decoded string: the digest has to mean "this file",
    // and a decode-then-re-encode would quietly normalize a BOM.
    return sha256Hex(await readFile(path));
  } catch {
    return null;
  }
}

/** `path` relative to `root`, POSIX-separated, or null when it escapes. */
export function relPosix(root: string, path: string): string | null {
  const rel = relative(resolve(root), resolve(path));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/**
 * A session id is a filename here, so it may not carry path syntax. Claude Code
 * writes UUIDs; a hand-passed `--session-id` is the case this guards, and a
 * `../` in one would write the manifest outside the directory it was aimed at.
 */
export function safeSessionId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 128) : "session";
}

export function manifestPathFor(dir: string, sessionId: string): string {
  return join(dir, `${safeSessionId(sessionId)}.json`);
}

/** The `<trace>.manifest.json` sibling — a manifest placed beside its trace. */
export function siblingManifestPath(tracePath: string): string {
  const ext = extname(tracePath);
  const stem = ext === "" ? tracePath : tracePath.slice(0, -ext.length);
  return `${stem}.manifest.json`;
}

// ── Persisting ───────────────────────────────────────────────────

export async function writeManifest(
  path: string,
  manifest: SessionManifest,
): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

/**
 * Read one manifest, or null. Absent, unreadable, unparseable, the wrong shape,
 * or written by a newer format version all produce null: consuming a manifest
 * is optional evidence-gathering, so every failure has to degrade to "no
 * evidence" rather than to a crash or, worse, to a partial read (ADR 01003).
 */
export async function readManifest(
  path: string,
): Promise<SessionManifest | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.version !== "number" || record.version > MANIFEST_VERSION) {
    return null;
  }
  if (typeof record.sessionId !== "string") return null;
  if (!Array.isArray(record.artifacts)) return null;
  return parsed as SessionManifest;
}

export interface FindManifestOptions {
  tracePath: string;
  /** The trace's own session id, when it recorded one. */
  sessionId?: string;
  /** Project root; the canonical manifest lives under it. */
  projectDir: string;
  /** Directory manifests are written to, relative to the project root. */
  captureDir: string;
  /** An explicitly named manifest, which is used without searching. */
  explicit?: string;
}

export interface FoundManifest {
  path: string;
  manifest: SessionManifest;
}

/**
 * Find the manifest for a trace, most-specific location first.
 *
 * 1. `<trace>.manifest.json` — someone put it there deliberately, which is a
 *    stronger statement of intent than any convention.
 * 2. `<trace dir>/<captureDir>/<session-id>.json` — a trace copied out of the
 *    session store together with the state directory.
 * 3. `<projectDir>/<captureDir>/<session-id>.json` — where `capture` writes.
 *
 * **A manifest recorded for a different session is refused**, not used. It is
 * evidence about that session, and letting it stand in here would be the one
 * way a manifest could produce a confidently wrong answer.
 */
export async function findManifest(
  options: FindManifestOptions,
): Promise<FoundManifest | null> {
  const candidates: string[] = [];
  if (options.explicit !== undefined) {
    candidates.push(options.explicit);
  } else {
    candidates.push(siblingManifestPath(options.tracePath));
    if (options.sessionId !== undefined) {
      candidates.push(
        manifestPathFor(
          resolve(dirname(options.tracePath), options.captureDir),
          options.sessionId,
        ),
        manifestPathFor(
          resolve(options.projectDir, options.captureDir),
          options.sessionId,
        ),
      );
    }
  }

  for (const path of candidates) {
    const manifest = await readManifest(path);
    if (manifest === null) continue;
    if (
      options.sessionId !== undefined &&
      manifest.sessionId !== options.sessionId
    ) {
      continue;
    }
    return { path, manifest };
  }
  return null;
}

// ── Comparing ────────────────────────────────────────────────────

/**
 * Compare the files one coverage row covers against what the manifest recorded.
 *
 * `actual` maps each covered file's project-relative POSIX path to its current
 * sha256. A row usually covers one file; project rules aggregate several, which
 * is why the outcome is decided over a set:
 *
 * - **any** recorded file whose digest differs → `mismatch`. One changed file
 *   makes the row's instructions different, whatever the others say.
 * - **every** covered file recorded and equal → `match`.
 * - otherwise → `skipped`, naming what the manifest could not speak to. A
 *   partial answer is not a clean one.
 */
export function checkContent(
  manifest: SessionManifest,
  actual: ReadonlyMap<string, string>,
): ContentCheck {
  const recorded = new Map(manifest.artifacts.map((a) => [a.path, a.sha256]));
  const missing: string[] = [];
  let matched = 0;

  for (const [path, digest] of actual) {
    const expected = recorded.get(path);
    if (expected === undefined) {
      missing.push(path);
      continue;
    }
    if (expected !== digest) {
      return { status: "mismatch", expected, actual: digest };
    }
    matched += 1;
  }

  if (matched === 0) {
    return {
      status: "skipped",
      reason:
        actual.size === 0
          ? "no file to compare"
          : "not recorded in the session manifest",
    };
  }
  if (missing.length > 0) {
    return {
      status: "skipped",
      reason: `not recorded in the session manifest: ${missing.join(", ")}`,
    };
  }
  const only = [...actual.entries()][0];
  return {
    status: "match",
    ...(actual.size === 1 && only !== undefined
      ? { expected: only[1], actual: only[1] }
      : {}),
  };
}

export * from "./types.js";
