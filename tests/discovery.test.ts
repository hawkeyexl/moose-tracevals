import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { discoverEvalSpecs } from "../src/discovery.js";
import { tmpDir } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("discoverEvalSpecs", () => {
  it("yaml in evals/ dir is found as standalone", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const evalsDir = join(tmp.dir, "evals");
    await mkdir(evalsDir, { recursive: true });
    await writeFile(join(evalsDir, "test.yaml"), "name: test\n");

    const results = await discoverEvalSpecs(tmp.dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].source, "standalone");
    assert.ok(results[0].file.endsWith("test.yaml"));
  });

  it("md with frontmatter evals is found as frontmatter", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    await writeFile(join(tmp.dir, "skill.md"), `---
name: my-skill
metadata:
  evals:
    - name: test
---
# Skill
`);

    const results = await discoverEvalSpecs(tmp.dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].source, "frontmatter");
  });

  it("md without evals is not returned", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    await writeFile(join(tmp.dir, "readme.md"), `# Just a README\n\nNo evals here.`);

    const results = await discoverEvalSpecs(tmp.dir);
    assert.equal(results.length, 0);
  });

  it("ignores node_modules, .git, dist directories", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const nmDir = join(tmp.dir, "node_modules", "evals");
    const gitDir = join(tmp.dir, ".git", "evals");
    const distDir = join(tmp.dir, "dist", "evals");
    await mkdir(nmDir, { recursive: true });
    await mkdir(gitDir, { recursive: true });
    await mkdir(distDir, { recursive: true });
    await writeFile(join(nmDir, "test.yaml"), "name: hidden\n");
    await writeFile(join(gitDir, "test.yaml"), "name: hidden\n");
    await writeFile(join(distDir, "test.yaml"), "name: hidden\n");

    const results = await discoverEvalSpecs(tmp.dir);
    assert.equal(results.length, 0);
  });

  it("single file input returns that file if it matches", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "test.yaml");
    await writeFile(file, "name: test\n");

    const results = await discoverEvalSpecs(file);
    assert.equal(results.length, 1);
    assert.equal(results[0].source, "standalone");
  });

  it("empty dir returns empty array", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;

    const results = await discoverEvalSpecs(tmp.dir);
    assert.equal(results.length, 0);
  });
});
