import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  appendArtifactCriteria,
  type NewCriterion,
} from "../../src/criteria/write.js";
import { extractCriteria } from "../../src/criteria/extract.js";
import { TracevalsError } from "../../src/types.js";
import { makeArtifact } from "../helpers.js";

const ONE: NewCriterion[] = [
  {
    name: "reads-before-editing",
    assertion: "The session read a source file before editing it.",
    grader: "tool-usage",
    options: { tool: "Read", expect: "used" },
    examples: { pass: ["Read then Edit"], fail: ["Edit with no prior Read"] },
  },
];

/** The frontmatter block of a rendered artifact, parsed back into an object. */
function frontmatterOf(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)^(?:---|\.\.\.)\r?\n/m.exec(content);
  expect(match, "expected a YAML frontmatter block").not.toBeNull();
  return parseYaml(match![1]!) as Record<string, unknown>;
}

describe("appendArtifactCriteria", () => {
  it("synthesizes a block for an artifact with no frontmatter", async () => {
    // The common case: 3 of 5 fixture artifacts carry no frontmatter at all.
    const body = "# Demo Project Rules\n\n- Run tests before declaring done.\n";
    const result = appendArtifactCriteria(body, "CLAUDE.md", ONE);

    expect(result.startsWith("---\n")).toBe(true);
    expect(result.endsWith(body)).toBe(true);

    const data = frontmatterOf(result);
    expect(data).toEqual({
      metadata: {
        evals: {
          criteria: [
            {
              name: "reads-before-editing",
              assertion: "The session read a source file before editing it.",
              grader: "tool-usage",
              options: { tool: "Read", expect: "used" },
              examples: {
                pass: ["Read then Edit"],
                fail: ["Edit with no prior Read"],
              },
            },
          ],
        },
      },
    });
  });

  it("adds metadata.evals to frontmatter that has none, preserving key order", () => {
    const source = [
      "---",
      "name: doc-writer",
      "description: Writes documentation.",
      "---",
      "",
      "You write docs.",
      "",
    ].join("\n");
    const result = appendArtifactCriteria(source, "doc-writer.md", ONE);

    expect(result.endsWith("\n\nYou write docs.\n")).toBe(true);
    const keys = Object.keys(frontmatterOf(result));
    expect(keys).toEqual(["name", "description", "metadata"]);
  });

  it("appends to existing criteria without disturbing them or their comments", () => {
    const source = [
      "---",
      "name: fix-bug",
      "metadata:",
      "  evals:",
      "    criteria:",
      "      # keep this comment",
      "      - name: used-read",
      "        assertion: The session read a file.",
      "        grader: tool-usage",
      "        options:",
      "          tool: Read",
      "---",
      "body text",
      "",
    ].join("\n");
    const result = appendArtifactCriteria(source, "SKILL.md", [
      { name: "no-shell", assertion: "No shell commands were run." },
    ]);

    expect(result).toContain("# keep this comment");
    expect(result).toContain("used-read");
    expect(result).toContain("no-shell");
    expect(result.endsWith("body text\n")).toBe(true);

    const criteria = (
      frontmatterOf(result).metadata as { evals: { criteria: unknown[] } }
    ).evals.criteria;
    expect(criteria).toHaveLength(2);
  });

  it("preserves a BOM and CRLF line endings", () => {
    // Built as a literal: this repo has no .gitattributes, so a fixture's
    // line endings would depend on the runner's core.autocrlf.
    const source = "﻿---\r\nname: fix-bug\r\n---\r\nbody\r\n";
    const result = appendArtifactCriteria(source, "SKILL.md", ONE);

    expect(result.charCodeAt(0)).toBe(0xfeff);
    expect(result.endsWith("---\r\nbody\r\n")).toBe(true);
    expect(/(?<!\r)\n/.test(result)).toBe(false);
  });

  it("preserves a `...` closing fence and content after it", () => {
    const source = "---\nname: x\n...\ntail\n";
    const result = appendArtifactCriteria(source, "x.md", ONE);
    expect(result.endsWith("...\ntail\n")).toBe(true);
  });

  it("refuses to write a criterion whose name already exists", () => {
    const source = [
      "---",
      "metadata:",
      "  evals:",
      "    criteria:",
      "      - name: reads-before-editing",
      "        assertion: Already here.",
      "---",
      "body",
      "",
    ].join("\n");
    expect(() => appendArtifactCriteria(source, "SKILL.md", ONE)).toThrow(
      TracevalsError,
    );
  });

  it("refuses non-YAML frontmatter rather than adding a second block", () => {
    const toml = '+++\nname = "x"\n+++\nbody\n';
    expect(() => appendArtifactCriteria(toml, "x.md", ONE)).toThrow(
      TracevalsError,
    );
  });

  it("rejects a string-shorthand collision too", () => {
    const source = [
      "---",
      "metadata:",
      "  evals:",
      "    criteria:",
      "      - A plain shorthand assertion.",
      "---",
      "body",
      "",
    ].join("\n");
    // Shorthand entries are unnamed, so appending a named criterion is fine.
    const result = appendArtifactCriteria(source, "SKILL.md", ONE);
    const criteria = (
      frontmatterOf(result).metadata as { evals: { criteria: unknown[] } }
    ).evals.criteria;
    expect(criteria).toHaveLength(2);
  });

  it("produces output the real reader accepts", async () => {
    // The assertion that matters: round-trip through extractCriteria, which
    // validates against the published schema.
    const result = appendArtifactCriteria("# Rules\n", "CLAUDE.md", ONE);
    const extracted = await extractCriteria(makeArtifact({ content: result }));

    expect(extracted.errors).toEqual([]);
    expect(extracted.declared).toBe(true);
    expect(extracted.criteria.map((c) => c.name)).toEqual([
      "reads-before-editing",
    ]);
    expect(extracted.criteria[0]?.grader).toBe("tool-usage");
  });

  it("fills in a metadata key that is present but empty", () => {
    // `metadata:` with no value parses to null, not undefined. Discovery
    // reports such a file as healthy, so the writer must not refuse it.
    for (const head of ["metadata:", "metadata:\n  evals:"]) {
      const source = `---\nname: x\n${head}\n---\nbody\n`;
      const result = appendArtifactCriteria(source, "SKILL.md", ONE);
      const criteria = (
        frontmatterOf(result).metadata as { evals: { criteria: unknown[] } }
      ).evals.criteria;
      expect(criteria).toHaveLength(1);
      expect(result.endsWith("body\n")).toBe(true);
    }
  });

  it("does not reflow long values it was not asked to touch", () => {
    const description =
      "Use this skill when the user asks about provisioning infrastructure, databases, caching layers, or any third-party service credentials for their project.";
    const source = `---\nname: x\ndescription: ${description}\n---\nbody\n`;
    const result = appendArtifactCriteria(source, "SKILL.md", ONE);

    expect(result).toContain(`description: ${description}`);
  });

  it("reports a non-mapping frontmatter block as an operational error", () => {
    // A leading `---` that is really a thematic break, so the "block" is a
    // sequence. The yaml library throws its own error type here.
    const source = "---\n- one\n- two\n---\nbody\n";
    expect(() => appendArtifactCriteria(source, "x.md", ONE)).toThrow(
      TracevalsError,
    );
  });

  it("is idempotent in shape: appending nothing returns the source unchanged", () => {
    const source = "---\nname: x\n---\nbody\n";
    expect(appendArtifactCriteria(source, "x.md", [])).toBe(source);
  });
});
