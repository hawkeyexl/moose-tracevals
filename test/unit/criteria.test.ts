import { describe, expect, it } from "vitest";
import { extractCriteria } from "../../src/criteria/extract.js";
import type { ResolvedArtifact } from "../../src/artifacts/types.js";

function artifact(content: string): ResolvedArtifact {
  return {
    name: "demo",
    type: "skill",
    path: "C:\\work\\demo\\SKILL.md",
    content,
    origin: "project",
  };
}

describe("extractCriteria", () => {
  it("reads declared criteria, expanding string shorthand", async () => {
    const result = await extractCriteria(
      artifact(
        [
          "---",
          "name: demo",
          "metadata:",
          "  evals:",
          "    criteria:",
          "      - Reproduce the bug first.",
          "      - name: used-read",
          "        assertion: The session read a file.",
          "        grader: tool-usage",
          "        options:",
          "          tool: Read",
          "          expect: used",
          "---",
          "",
          "# Demo",
        ].join("\n"),
      ),
    );
    expect(result.declared).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[0]).toMatchObject({
      name: "criterion-1",
      assertion: "Reproduce the bug first.",
      grader: "llm",
      severity: "error",
    });
    expect(result.criteria[1]).toMatchObject({
      name: "used-read",
      grader: "tool-usage",
      options: { tool: "Read", expect: "used" },
    });
  });

  it("reports schema violations with source line numbers", async () => {
    const result = await extractCriteria(
      artifact(
        [
          "---",
          "name: demo",
          "metadata:",
          "  evals:",
          "    criteria:",
          "      - assertion: x",
          "        grader: sorcery",
          "---",
        ].join("\n"),
      ),
    );
    expect(result.declared).toBe(true);
    expect(result.criteria).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => typeof e.line === "number")).toBe(true);
  });

  it("returns declared=false when there is no evals block", async () => {
    const result = await extractCriteria(artifact("---\nname: demo\n---\n# D"));
    expect(result.declared).toBe(false);
    expect(result.criteria).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("honors skip", async () => {
    const result = await extractCriteria(
      artifact("---\nmetadata:\n  evals:\n    skip: true\n---\n"),
    );
    expect(result.skip).toBe(true);
  });
});
