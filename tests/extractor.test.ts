import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { extractCriteria, applyCriteriaOverrides } from "../src/extractor.js";
import { tmpDir } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("extractCriteria", () => {
  it("skill: extracts entry, exit, process_steps, trigger_description", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "SKILL.md");
    await writeFile(file, `---
description: 'Run tests on documentation'
---

# My Skill

## Entry Criteria

- Source files provided
- Config exists

## Exit Criteria

- Tests pass
- Report generated

## Process Steps

1. Load config
2. Run tests
3. Generate report
`);
    const result = await extractCriteria("skill", file, tmp.dir);
    assert.equal(result.trigger_description, "Run tests on documentation");
    assert.deepStrictEqual(result.entry, ["Source files provided", "Config exists"]);
    assert.deepStrictEqual(result.exit, ["Tests pass", "Report generated"]);
    assert.deepStrictEqual(result.process_steps, ["Load config", "Run tests", "Generate report"]);
  });

  it("agent: extracts constraints, quality_criteria, escalation_rules, capabilities, tools", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "agent.md");
    await writeFile(file, `---
tools: ['Read', 'Write', 'Bash']
---

# My Agent

## Constraints

- Never modify production files
- Must ask before deleting

## Quality Criteria

- Output is well-formatted
- Code follows style guide

## Escalation Rules

- Escalate on auth errors

## Capabilities

- File editing
- Test running
`);
    const result = await extractCriteria("agent", file, tmp.dir);
    assert.deepStrictEqual(result.constraints, ["Never modify production files", "Must ask before deleting"]);
    assert.deepStrictEqual(result.quality_criteria, ["Output is well-formatted", "Code follows style guide"]);
    assert.deepStrictEqual(result.escalation_rules, ["Escalate on auth errors"]);
    assert.deepStrictEqual(result.capabilities, ["File editing", "Test running"]);
    assert.deepStrictEqual(result.tools, ["Read", "Write", "Bash"]);
  });

  it("project-rules: extracts rules, gates, conventions by heading context", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "AGENTS.md");
    await writeFile(file, `# Project Rules

- Always run tests before committing
- Use TypeScript strict mode

## Gate Review

- All tests must pass
- No lint errors

## Naming Conventions

- Use camelCase for variables
- Use PascalCase for types
`);
    const result = await extractCriteria("project-rules", file, tmp.dir);
    assert.ok(result.rules!.includes("Always run tests before committing"));
    assert.ok(result.rules!.includes("Use TypeScript strict mode"));
    assert.ok(result.gates!.includes("All tests must pass"));
    assert.ok(result.gates!.includes("No lint errors"));
    assert.ok(result.conventions!.includes("Use camelCase for variables"));
    assert.ok(result.conventions!.includes("Use PascalCase for types"));
  });

  it("spec: extracts requirements, acceptance_criteria, uncertainty_markers", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, "spec.md");
    await writeFile(file, `# Feature Spec

## Requirements

- Must support JSON and YAML input
- Must validate schema [NEEDS CLARIFICATION]

## Acceptance Criteria

- All tests pass
- Documentation updated [TODO]
`);
    const result = await extractCriteria("spec", file, tmp.dir);
    assert.ok(result.requirements!.includes("Must support JSON and YAML input"));
    assert.ok(result.requirements!.includes("Must validate schema [NEEDS CLARIFICATION]"));
    assert.ok(result.acceptance_criteria!.includes("All tests pass"));
    assert.ok(result.uncertainty_markers!.includes("[NEEDS CLARIFICATION]"));
    assert.ok(result.uncertainty_markers!.includes("[TODO]"));
  });
});

describe("applyCriteriaOverrides", () => {
  it("replaces auto-extracted sections with user-provided values", () => {
    const extracted = {
      entry: ["auto entry 1"],
      exit: ["auto exit 1"],
      requirements: ["auto req 1"],
    };
    const overrides = {
      entry: ["custom entry"],
      requirements: ["custom req 1", "custom req 2"],
    };
    const result = applyCriteriaOverrides(extracted, overrides);
    assert.deepStrictEqual(result.entry, ["custom entry"]);
    assert.deepStrictEqual(result.exit, ["auto exit 1"]);
    assert.deepStrictEqual(result.requirements, ["custom req 1", "custom req 2"]);
  });

  it("returns extracted unchanged when no overrides", () => {
    const extracted = { entry: ["a"], exit: ["b"] };
    const result = applyCriteriaOverrides(extracted);
    assert.deepStrictEqual(result, extracted);
  });
});
