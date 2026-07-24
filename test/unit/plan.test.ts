import { describe, expect, it } from "vitest";
import { planEvals } from "../../src/core/plan.js";
import type { ResolvedArtifact } from "../../src/artifacts/types.js";

function artifact(
  name: string,
  content: string,
  type: ResolvedArtifact["type"] = "skill",
): ResolvedArtifact {
  return { name, type, path: `C:\\work\\${name}.md`, content, origin: "project" };
}

describe("planEvals", () => {
  it("plans one eval per declared criterion", async () => {
    const plans = await planEvals([
      artifact(
        "fix-bug",
        [
          "---",
          "metadata:",
          "  evals:",
          "    criteria:",
          "      - name: used-read",
          "        assertion: Read a file.",
          "        grader: tool-usage",
          "        options: { tool: Read, expect: used }",
          "      - Reproduce the bug first.",
          "---",
          "# Fix Bug",
        ].join("\n"),
      ),
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      evalName: "used-read",
      grader: "tool-usage",
      implicit: false,
    });
    expect(plans[1]).toMatchObject({
      evalName: "criterion-2",
      grader: "llm",
      implicit: false,
    });
  });

  it("plans one implicit whole-artifact eval when nothing is declared", async () => {
    const plans = await planEvals([
      artifact("CLAUDE.md", "# Rules\n- Run tests.", "project-rules"),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      evalName: "adheres-to-artifact",
      grader: "llm",
      implicit: true,
    });
    expect(plans[0]?.assertion).toContain("adhered to the instructions");
  });

  it("plans an error eval for an invalid evals block", async () => {
    const plans = await planEvals([
      artifact(
        "broken",
        "---\nmetadata:\n  evals:\n    criteria:\n      - grader: llm\n---\n",
      ),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.error).toBeDefined();
    expect(plans[0]?.evalName).toBe("evals-block-valid");
  });

  it("skips artifacts marked skip", async () => {
    const plans = await planEvals([
      artifact("skipped", "---\nmetadata:\n  evals:\n    skip: true\n---\n"),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.skipped).toBe(true);
  });
});
