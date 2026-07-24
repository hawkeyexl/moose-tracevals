import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverArtifacts } from "../../src/artifacts/discover.js";

const fixtureProject = fileURLToPath(
  new URL("../fixtures/project", import.meta.url),
);

/** `<type>:<basename>` — stable across OS path separators. */
function ids(artifacts: { artifact: { type: string; path: string } }[]): string[] {
  return artifacts
    .map((a) => `${a.artifact.type}:${a.artifact.path.replace(/\\/g, "/").split("/").pop()}`)
    .sort();
}

describe("discoverArtifacts", () => {
  it("finds every artifact in the fixture project and nothing else", async () => {
    const result = await discoverArtifacts({ root: fixtureProject });

    expect(ids(result.artifacts)).toEqual([
      "agent:doc-writer.md",
      "project-rules:AGENTS.md",
      "project-rules:CLAUDE.md",
      "skill:SKILL.md",
    ]);
    // packages/api/README.md is a doc, not an instruction artifact.
    expect(
      result.artifacts.some((a) => a.artifact.path.endsWith("README.md")),
    ).toBe(false);
  });

  it("reports criteria already declared, for dedupe and cache keying", async () => {
    const result = await discoverArtifacts({ root: fixtureProject });
    const skill = result.artifacts.find((a) => a.artifact.type === "skill");

    expect(skill?.status).toBe("ok");
    // fix-bug declares two named criteria plus one string shorthand.
    expect(skill?.existingNames).toContain("used-read");
    expect(skill?.existingNames).toContain("forbidden-tool");

    const rules = result.artifacts.find((a) =>
      a.artifact.path.endsWith("CLAUDE.md"),
    );
    expect(rules?.status).toBe("ok");
    expect(rules?.existingNames).toEqual([]);
  });

  describe("in a scratch tree", () => {
    let dir: string;

    beforeAll(async () => {
      await mkdir(".tmp", { recursive: true });
      dir = await mkdtemp(join(".tmp", "discover-"));
      await mkdir(join(dir, ".claude", "skills", "good"), { recursive: true });
      await mkdir(join(dir, ".claude", "skills", "broken"), { recursive: true });
      await mkdir(join(dir, "node_modules", ".claude", "skills", "vendored"), {
        recursive: true,
      });
      await mkdir(join(dir, "agents"), { recursive: true });

      await writeFile(
        join(dir, ".claude", "skills", "good", "SKILL.md"),
        "---\nname: good\n---\nbody\n",
      );
      // Unterminated flow mapping: docmeta's extractFrontmatter throws on this.
      await writeFile(
        join(dir, ".claude", "skills", "broken", "SKILL.md"),
        "---\nname: [unclosed\ndescription: x\n---\nbody\n",
      );
      await writeFile(
        join(dir, "node_modules", ".claude", "skills", "vendored", "SKILL.md"),
        "---\nname: vendored\n---\nbody\n",
      );
      await writeFile(join(dir, "agents", "helper.md"), "---\nname: helper\n---\nx\n");
      await writeFile(join(dir, "GEMINI.md"), "# Gemini rules\n");
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("contains malformed frontmatter instead of throwing", async () => {
      const result = await discoverArtifacts({ root: dir });
      const broken = result.artifacts.find((a) =>
        a.artifact.path.includes("broken"),
      );
      expect(broken?.status).toBe("unreadable");
      expect(broken?.error).toBeTruthy();

      // A neighbouring good artifact is still discovered.
      expect(
        result.artifacts.find((a) => a.artifact.path.includes("good"))?.status,
      ).toBe("ok");
    });

    it("prunes node_modules", async () => {
      const result = await discoverArtifacts({ root: dir });
      expect(
        result.artifacts.some((a) => a.artifact.path.includes("node_modules")),
      ).toBe(false);
    });

    it("recognizes GEMINI.md and bare agents/ definitions", async () => {
      const result = await discoverArtifacts({ root: dir });
      expect(ids(result.artifacts)).toContain("project-rules:GEMINI.md");
      expect(ids(result.artifacts)).toContain("agent:helper.md");
    });

    it("accepts an explicit file path, bypassing convention", async () => {
      const target = join(dir, ".claude", "skills", "good", "SKILL.md");
      const result = await discoverArtifacts({ root: dir, paths: [target] });
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]?.artifact.type).toBe("skill");
    });
  });
});
