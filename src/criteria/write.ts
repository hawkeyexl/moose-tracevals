/**
 * Surgical criteria append. Only the YAML frontmatter block is re-serialized
 * via the `yaml` Document API — everything from the closing fence onward is
 * carried over byte-for-byte, and untouched YAML keeps its comments, ordering,
 * and style. Artifacts with no frontmatter get a block synthesized above the
 * untouched body, which is the common case for CLAUDE.md / AGENTS.md.
 *
 * Writing is an authoring-time operation, never part of evaluation (ADR 01005).
 */
import { Document, isMap, isSeq, parseDocument, type YAMLSeq } from "yaml";
import { AgentevalsError } from "../types.js";
import type { Severity } from "./extract.js";

/** A criterion to add. Mirrors the published artifact-evals object form. */
export interface NewCriterion {
  name: string;
  assertion: string;
  type?: "capability" | "regression";
  grader?: string;
  options?: Record<string, unknown>;
  severity?: Severity;
  evidence?: string;
  examples?: { pass?: string[]; fail?: string[] };
}

interface Split {
  /** BOM plus the opening fence line, including its newline. */
  open: string;
  /** Raw YAML between the fences. */
  block: string;
  /** Closing fence to EOF, byte-identical. */
  suffix: string;
  eol: "\n" | "\r\n";
}

/** Frontmatter dialect an artifact opens with, or undefined when it has none. */
function leadingFormat(content: string): "yaml" | "toml" | "json" | undefined {
  const body = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  if (/^---\r?\n/.test(body)) return "yaml";
  if (/^\+\+\+\r?\n/.test(body)) return "toml";
  if (/^;;;\r?\n/.test(body)) return "json";
  return undefined;
}

function splitYamlFrontmatter(content: string, path: string): Split {
  const bom = content.charCodeAt(0) === 0xfeff ? content[0]! : "";
  const body = bom ? content.slice(1) : content;
  const openMatch = /^---(\r?\n)/.exec(body);
  if (!openMatch) {
    throw new AgentevalsError(`${path}: no YAML frontmatter block to edit`);
  }
  const eol: "\n" | "\r\n" = openMatch[1] === "\r\n" ? "\r\n" : "\n";
  const lines = body.split(/(?<=\n)/); // split but keep line endings
  let offset = lines[0]!.length;
  for (let i = 1; i < lines.length; i += 1) {
    const stripped = lines[i]!.replace(/\r?\n$/, "");
    if (stripped === "---" || stripped === "...") {
      return {
        open: bom + lines[0]!,
        block: body.slice(lines[0]!.length, offset),
        suffix: body.slice(offset),
        eol,
      };
    }
    offset += lines[i]!.length;
  }
  throw new AgentevalsError(`${path}: unterminated frontmatter block`);
}

/** Ordered plain object for one criterion, with absent fields dropped. */
function criterionObject(criterion: NewCriterion): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    name: criterion.name,
    assertion: criterion.assertion,
  };
  if (criterion.type !== undefined) obj.type = criterion.type;
  if (criterion.grader !== undefined) obj.grader = criterion.grader;
  if (criterion.options !== undefined) obj.options = criterion.options;
  if (criterion.severity !== undefined) obj.severity = criterion.severity;
  if (criterion.evidence !== undefined) obj.evidence = criterion.evidence;
  if (criterion.examples !== undefined) obj.examples = criterion.examples;
  return obj;
}

/**
 * Existing criterion names. String-shorthand entries are unnamed — their
 * identity is positional — so they never collide with a named append.
 */
function existingNames(seq: YAMLSeq): Set<string> {
  const names = new Set<string>();
  for (const item of seq.items) {
    if (isMap(item)) {
      const name = item.get("name");
      if (typeof name === "string") names.add(name);
    }
  }
  return names;
}

/** Locate `metadata.evals.criteria`, creating each missing level. */
function criteriaSeq(doc: Document, path: string): YAMLSeq {
  const existing = doc.getIn(["metadata", "evals", "criteria"], true);
  if (existing !== undefined) {
    if (!isSeq(existing)) {
      throw new AgentevalsError(
        `${path}: metadata.evals.criteria is not a list`,
      );
    }
    return existing;
  }
  for (const [key, parent] of [
    ["metadata", [] as string[]],
    ["evals", ["metadata"]],
  ] as const) {
    const at = [...parent, key];
    const node = doc.getIn(at, true);
    if (node === undefined) {
      doc.setIn(at, doc.createNode({}));
    } else if (!isMap(node)) {
      throw new AgentevalsError(`${path}: ${at.join(".")} is not a mapping`);
    }
  }
  const seq = doc.createNode([]) as YAMLSeq;
  doc.setIn(["metadata", "evals", "criteria"], seq);
  return seq;
}

/**
 * Append criteria to an artifact's `metadata.evals.criteria`, returning the
 * new file content. Throws when the frontmatter is not YAML or when a name
 * already exists — a collision means the caller's dedupe missed something,
 * and silently overwriting a human-authored criterion is never right.
 */
export function appendArtifactCriteria(
  content: string,
  path: string,
  criteria: NewCriterion[],
): string {
  if (criteria.length === 0) return content;

  const format = leadingFormat(content);
  if (format === "toml" || format === "json") {
    // Synthesizing a YAML block would leave the artifact with two
    // frontmatter blocks; only YAML can be edited in place.
    throw new AgentevalsError(
      `${path}: only YAML frontmatter can be edited (found ${format} frontmatter)`,
    );
  }

  const bom = content.charCodeAt(0) === 0xfeff ? content[0]! : "";
  const stripped = bom ? content.slice(1) : content;

  if (format === undefined) {
    const eol: "\n" | "\r\n" = stripped.includes("\r\n") ? "\r\n" : "\n";
    const doc = new Document({
      metadata: { evals: { criteria: criteria.map(criterionObject) } },
    });
    let block = doc.toString();
    if (eol === "\r\n") block = block.replace(/(?<!\r)\n/g, "\r\n");
    return `${bom}---${eol}${block}---${eol}${stripped}`;
  }

  const { open, block, suffix, eol } = splitYamlFrontmatter(content, path);
  const doc = parseDocument(block);
  if (doc.errors.length > 0) {
    throw new AgentevalsError(
      `${path}: cannot edit frontmatter — ${doc.errors[0]?.message ?? "parse error"}`,
    );
  }

  const seq = criteriaSeq(doc, path);
  const taken = existingNames(seq);
  for (const criterion of criteria) {
    if (taken.has(criterion.name)) {
      throw new AgentevalsError(
        `${path}: criterion "${criterion.name}" already exists in frontmatter`,
      );
    }
    taken.add(criterion.name);
    seq.add(doc.createNode(criterionObject(criterion)));
  }

  let updated = doc.toString();
  if (eol === "\r\n") updated = updated.replace(/(?<!\r)\n/g, "\r\n");
  return open + updated + suffix;
}
