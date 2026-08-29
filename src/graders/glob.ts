/**
 * A small path glob, for grader options that name a set of files rather than
 * one (ADR 01016).
 *
 * Deliberately not a dependency: the syntax needed here is `**`, `*`, and `?`
 * over already-normalized paths, and a matcher that small is easier to pin than
 * to pick. Matching follows the same rule as the `file-access` grader's
 * suffix compare — separators normalized, case folded, anchored at a path
 * segment boundary — so `docs/**` reads the same whatever the checkout root is.
 */

/** Escapes every regex metacharacter; `*` and `?` are handled by the caller. */
const literal = (ch: string): string => ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");

export function globToRegExp(glob: string): RegExp {
  const spec = glob.replace(/\\/g, "/").toLowerCase();
  let out = "";
  for (let i = 0; i < spec.length; i += 1) {
    const ch = spec[i] as string;
    if (ch === "?") {
      out += "[^/]";
      continue;
    }
    if (ch !== "*") {
      out += literal(ch);
      continue;
    }
    if (spec[i + 1] !== "*") {
      out += "[^/]*";
      continue;
    }
    // `**` spans separators, and must allow *zero* segments: `docs/**` has to
    // match `docs` itself, and `docs/**/x` has to match `docs/x`. Both cases
    // absorb one adjacent separator rather than requiring it.
    i += 1;
    if (spec[i + 1] === "/") {
      i += 1;
      out += "(?:.*/)?";
    } else if (out.endsWith("/")) {
      out = `${out.slice(0, -1)}(?:/.*)?`;
    } else {
      out += ".*";
    }
  }
  // Trace paths are absolute and machine-specific, so a spec matches any
  // ancestor prefix — but only whole segments, so `docs/**` does not match
  // `docsite/`.
  return new RegExp(`^(?:.*/)?${out}$`);
}

/** True when `path` matches `glob`, both normalized the same way. */
export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path.replace(/\\/g, "/").toLowerCase());
}
