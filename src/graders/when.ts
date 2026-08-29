/**
 * Conditional triggers (ADR 01016): `options.when` arms an eval only for the
 * sessions it is about.
 *
 * The point is to make the *absence* of an artifact checkable. You cannot hang
 * an eval on a skill that never loaded — nothing resolves it, so nothing plans
 * it — but you can hang it on `CLAUDE.md`, which resolves for every session.
 * `when` is what lets that always-planned eval stay quiet on the sessions it
 * has nothing to say about.
 *
 * **A trigger that does not fire is `skipped`, never `pass`.** A check that
 * never armed has not been satisfied, and reporting it as a pass would make a
 * green report out of an eval that never ran — the same reasoning that makes an
 * empty window a skip (ADR 01015).
 *
 * Predicates are pure trace facts, evaluated over the artifact's window, and
 * every listed one must hold.
 *
 * `options` is an open object by schema decree — "validated by the grader at
 * run time — a grader's options evolve on the grader's schedule" — so this
 * costs no schema change and no upstream docmeta proposal (ADR 01010).
 */
import { matchesGlob } from "./glob.js";
import type { TraceWindow } from "./util.js";
import type { Options } from "./util.js";

/** Every recognised condition. Unknown keys are an error, never ignored. */
export const WHEN_CONDITIONS = [
  "file-access",
  "tool-used",
  "prompt-matches",
  "turn-count-above",
] as const;

export type WhenCondition = (typeof WHEN_CONDITIONS)[number];

/** What a trigger decided, and — when it did not fire — why. */
export interface TriggerResult {
  armed: boolean;
  /** Reason phrase for the skip; set only when `armed` is false. */
  reason?: string;
}

/**
 * Validate `options.when` without a trace, so `fill` can ground-check a
 * proposal before writing it (ADR 01004).
 *
 * An unrecognised condition is rejected rather than dropped. A silently
 * ignored `file-acess` would leave the eval armed on every session — the loud
 * failure is the safe one, and it mirrors how `metadata.eval*` reserves its
 * own prefix in `src/evals/extract.ts`.
 */
export function validateWhen(options: Options): string | undefined {
  const when = options.when;
  if (when === undefined) return undefined;
  if (typeof when !== "object" || when === null || Array.isArray(when)) {
    return "options.when must be an object of conditions";
  }
  const conditions = when as Record<string, unknown>;
  const keys = Object.keys(conditions);
  if (keys.length === 0) {
    // A trigger with no conditions arms on every session, which is the same as
    // having no trigger — but reads like a scoped check.
    return `options.when needs at least one of: ${WHEN_CONDITIONS.join(", ")}`;
  }
  for (const key of keys) {
    if (!(WHEN_CONDITIONS as readonly string[]).includes(key)) {
      return `options.when.${key} is not a known condition; expected one of: ${WHEN_CONDITIONS.join(", ")}`;
    }
  }
  for (const key of ["file-access", "tool-used", "prompt-matches"] as const) {
    const value = conditions[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length === 0) {
      return `options.when.${key} must be a string`;
    }
  }
  const pattern = conditions["prompt-matches"];
  if (typeof pattern === "string") {
    try {
      new RegExp(pattern);
    } catch (err) {
      return `options.when.prompt-matches is not a valid regular expression: ${(err as Error).message}`;
    }
  }
  const floor = conditions["turn-count-above"];
  if (floor !== undefined) {
    if (typeof floor !== "number" || !Number.isInteger(floor)) {
      return "options.when.turn-count-above must be a whole number";
    }
    if (floor < 0) return "options.when.turn-count-above must be at least 0";
  }
  return undefined;
}

/**
 * Decide whether the trigger fires over a window. Conjunctive: the first
 * condition that fails names itself in the reason, so a skipped eval says
 * which half of its trigger was missing rather than only that it was.
 */
export function evaluateWhen(options: Options, window: TraceWindow): TriggerResult {
  const when = options.when as Record<string, unknown> | undefined;
  if (when === undefined) return { armed: true };

  const glob = when["file-access"];
  if (typeof glob === "string") {
    const hit = window.fileAccesses.some((a) => matchesGlob(a.path, glob));
    if (!hit) return unmet(`no file matching "${glob}" was accessed`, window);
  }

  const tool = when["tool-used"];
  if (typeof tool === "string") {
    const hit = window.toolCalls.some((c) => c.name === tool);
    if (!hit) return unmet(`the ${tool} tool was never used`, window);
  }

  const pattern = when["prompt-matches"];
  if (typeof pattern === "string") {
    const re = new RegExp(pattern);
    const hit = window.userMessages.some((text) => re.test(text));
    if (!hit) return unmet(`no prompt matched /${pattern}/`, window);
  }

  const floor = when["turn-count-above"];
  if (typeof floor === "number") {
    if (!(window.turnCount > floor)) {
      return unmet(
        `${window.turnCount} turn(s) is not more than ${floor}`,
        window,
      );
    }
  }

  return { armed: true };
}

function unmet(detail: string, window: TraceWindow): TriggerResult {
  return {
    armed: false,
    reason: `trigger not met (${window.label}): ${detail}`,
  };
}
