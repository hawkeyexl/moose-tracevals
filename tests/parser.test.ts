import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEvalSource, ParseError } from "../src/parser.js";
import { tmpDir } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("parseEvalSource", () => {
  it("standalone YAML: parses name, description, type, artifact, cases, criteria", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "eval.yaml");
    await writeFile(file, `
name: my-eval
description: Test eval
type: capability
artifact:
  type: skill
  path: ./skill.md
cases:
  - name: basic
    prompt: "do something"
    criteria:
      - name: check1
        type: code
        grader: trigger-check
        config:
          skill_name: my-skill
`);
    const specs = await parseEvalSource({ file, source: "standalone" });
    assert.equal(specs.length, 1);
    assert.equal(specs[0].name, "my-eval");
    assert.equal(specs[0].description, "Test eval");
    assert.equal(specs[0].type, "capability");
    assert.equal(specs[0].artifact.type, "skill");
    assert.equal(specs[0].artifact.path, "./skill.md");
    assert.equal(specs[0].cases.length, 1);
    assert.equal(specs[0].cases[0].criteria[0].name, "check1");
    assert.equal(specs[0].cases[0].criteria[0].grader, "trigger-check");
  });

  it("frontmatter .md: parses metadata.evals array, infers artifact type", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const skillDir = join(tmp.dir, "skills", "my-skill");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(skillDir, { recursive: true });
    const file = join(skillDir, "SKILL.md");
    await writeFile(file, `---
name: my-skill
description: A skill
metadata:
  evals:
    - name: trigger-test
      cases:
        - name: basic
          prompt: "run skill"
          criteria:
            - name: triggered
              type: code
              grader: trigger-check
---

# My Skill
`);
    const specs = await parseEvalSource({ file, source: "frontmatter" });
    assert.equal(specs.length, 1);
    assert.equal(specs[0].name, "trigger-test");
    assert.equal(specs[0].artifact.type, "skill");
    assert.equal(specs[0].artifact.path, file);
  });

  it("defaults: trials=3, model=claude-sonnet-4-6, type=capability", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "eval.yaml");
    await writeFile(file, `
name: defaults-test
description: Test defaults
type: capability
artifact:
  type: skill
  path: ./skill.md
cases:
  - name: basic
    prompt: "test"
    criteria:
      - name: c1
        type: code
        grader: trigger-check
`);
    const specs = await parseEvalSource({ file, source: "standalone" });
    assert.equal(specs[0].trials, 3);
    assert.equal(specs[0].model, "claude-sonnet-4-6");
  });

  it("validation: missing name throws ParseError", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "bad.yaml");
    await writeFile(file, `
description: No name
type: capability
artifact:
  type: skill
  path: ./skill.md
cases:
  - name: basic
    prompt: "test"
    criteria:
      - name: c1
        type: code
        grader: trigger-check
`);
    await assert.rejects(
      () => parseEvalSource({ file, source: "standalone" }),
      (err: unknown) => err instanceof ParseError
    );
  });

  it("validation: invalid type throws ParseError", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "bad.yaml");
    await writeFile(file, `
name: bad-type
description: Invalid type
type: invalid-type
artifact:
  type: skill
  path: ./skill.md
cases:
  - name: basic
    prompt: "test"
    criteria:
      - name: c1
        type: code
        grader: trigger-check
`);
    await assert.rejects(
      () => parseEvalSource({ file, source: "standalone" }),
      (err: unknown) => err instanceof ParseError
    );
  });

  it("validation: empty cases throws ParseError", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "bad.yaml");
    await writeFile(file, `
name: empty-cases
description: No cases
type: capability
artifact:
  type: skill
  path: ./skill.md
cases: []
`);
    await assert.rejects(
      () => parseEvalSource({ file, source: "standalone" }),
      (err: unknown) => err instanceof ParseError
    );
  });

  it("artifact type inference: path-based", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    // agents/ path -> agent type
    const agentsDir = join(tmp.dir, "agents");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(agentsDir, { recursive: true });
    const file = join(agentsDir, "my-agent.md");
    await writeFile(file, `---
name: my-agent
description: An agent
metadata:
  evals:
    - name: agent-test
      cases:
        - name: basic
          prompt: "test"
          criteria:
            - name: c1
              type: code
              grader: trigger-check
---
# Agent
`);
    const specs = await parseEvalSource({ file, source: "frontmatter" });
    assert.equal(specs[0].artifact.type, "agent");
  });

  it("composite criterion: parses sub_criteria and weight", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "eval.yaml");
    await writeFile(file, `
name: composite-test
description: Test composite
type: capability
artifact:
  type: skill
  path: ./skill.md
cases:
  - name: combined
    prompt: "test"
    criteria:
      - name: all-checks
        type: composite
        grader: weighted
        weight: 2
        sub_criteria:
          - name: sub1
            type: code
            grader: trigger-check
          - name: sub2
            type: code
            grader: regex-match
`);
    const specs = await parseEvalSource({ file, source: "standalone" });
    const criterion = specs[0].cases[0].criteria[0];
    assert.equal(criterion.grader, "weighted");
    assert.equal(criterion.weight, 2);
    assert.ok(criterion.sub_criteria);
    assert.equal(criterion.sub_criteria!.length, 2);
    assert.equal(criterion.sub_criteria![0].name, "sub1");
    assert.equal(criterion.sub_criteria![1].name, "sub2");
  });
});
