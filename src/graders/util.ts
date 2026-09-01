/** Shared helpers for deterministic graders. */
import type { EvalPlan } from "../core/plan.js";
import type { Finding, GradeResult } from "./types.js";

export function finding(plan: EvalPlan, message: string): Finding {
  return {
    evalName: plan.evalName,
    artifact: plan.artifact.path,
    message,
    severity: plan.severity,
  };
}

export function fail(plan: EvalPlan, message: string): GradeResult {
  return { findings: [finding(plan, message)] };
}

export const pass: GradeResult = { findings: [] };

export function optionsError(kind: string, message: string): GradeResult {
  return { findings: [], error: `${kind}: ${message}` };
}

/** An option-validation outcome: a message when invalid, undefined when fine. */
export type OptionCheck = string | undefined;

export type Options = Record<string, unknown>;

/** First failing check, so callers read as a flat list of constraints. */
export function firstError(...checks: OptionCheck[]): OptionCheck {
  return checks.find((check) => check !== undefined);
}

export function requiredString(options: Options, key: string): OptionCheck {
  const value = options[key];
  if (typeof value !== "string" || value.length === 0) {
    return `options.${key} is required`;
  }
  return undefined;
}

export function optionalString(options: Options, key: string): OptionCheck {
  const value = options[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    return `options.${key} must be a non-empty string`;
  }
  return undefined;
}

export function optionalEnum(
  options: Options,
  key: string,
  allowed: readonly string[],
): OptionCheck {
  const value = options[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    return `options.${key} must be one of: ${allowed.join(", ")}`;
  }
  return undefined;
}

export function optionalNumber(
  options: Options,
  key: string,
  bounds: { min?: number; integer?: boolean } = {},
): OptionCheck {
  const value = options[key];
  if (value === undefined) return undefined;
  // Number.isFinite also rejects NaN and both infinities.
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `options.${key} must be a finite number`;
  }
  if (bounds.integer === true && !Number.isInteger(value)) {
    return `options.${key} must be a whole number`;
  }
  if (bounds.min !== undefined && value < bounds.min) {
    return `options.${key} must be at least ${bounds.min}`;
  }
  return undefined;
}

export function optionalBoolean(options: Options, key: string): OptionCheck {
  if (options[key] !== undefined && typeof options[key] !== "boolean") {
    return `options.${key} must be a boolean`;
  }
  return undefined;
}

/** Rejects min > max once both are present and already known to be numbers. */
export function orderedBounds(
  options: Options,
  minKey: string,
  maxKey: string,
): OptionCheck {
  const min = options[minKey];
  const max = options[maxKey];
  if (typeof min === "number" && typeof max === "number" && min > max) {
    return `options.${maxKey} must be greater than or equal to options.${minKey}`;
  }
  return undefined;
}

/**
 * Rejects a criterion that configures no bound at all. Such a criterion can
 * never fail, so it reads as coverage while asserting nothing.
 */
export function requireOneOf(options: Options, keys: string[]): OptionCheck {
  if (keys.some((key) => options[key] !== undefined)) return undefined;
  return `at least one of ${keys.map((k) => `options.${k}`).join(" or ")} is required`;
}
