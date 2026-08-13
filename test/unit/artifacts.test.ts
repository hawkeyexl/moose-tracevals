import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveArtifacts } from "../../src/artifacts/resolve.js";
import { parseTraceFile } from "../../src/trace/claude.js";
import type { Trace } from "../../src/trace/types.js";

const fixtureHome = fileURLToPath(
  new URL("../fixtures/home", import.meta.url),
);
const fixtureProject = fileURLToPath(
  new URL("../fixtures/project", import.meta.url),
);
const nestedDir = fileURLToPath(
  new URL("../fixtures/project/packages/api", import.meta.url),
);
const sessionFixture = fileURLToPath(
  new URL("../fixtures/traces/claude-session.jsonl", import.meta.url),
);

function emptyTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    source: "claude-code",
    file: "trace.jsonl",
    cwd: fixtureProject,
    events: [],
    toolCalls: [],
    skillInvocations: [],
    agentSpawns: [],
    fileAccesses: [],
    userMessages: [],
    assistantTexts: [],
    turnCount: 0,
    warnings: [],
    ...overrides,
  };
}

async function resolveFixtureSession() {
  const trace = await parseTraceFile(sessionFixture);
  return resolveArtifacts(trace, {
    projectDir: fixtureProject,
    env: { MOOSE_TRACEVALS_HOME: fixtureHome },
  });
}

describe("resolveArtifacts", () => {
  it("resolves a project skill from .claude/skills", async () => {
    const { artifacts } = await resolveFixtureSession();
    const skill = artifacts.find(
      (a) => a.type === "skill" && a.name === "fix-bug",
    );
    expect(skill).toBeDefined();
    expect(skill?.path?.endsWith("SKILL.md")).toBe(true);
    expect(skill?.content).toContain("Reproduce the bug");
    expect(skill?.origin).toBe("project");
  });

  it("resolves a plugin skill from the user plugin store", async () => {
    const { artifacts } = await resolveFixtureSession();
    const skill = artifacts.find(
      (a) => a.name === "writing-toolkit:identify-ai-tells",
    );
    expect(skill).toBeDefined();
    expect(skill?.origin).toBe("plugin");
    expect(skill?.content).toContain("Detection only");
  });

  it("resolves a project agent definition by subagent_type", async () => {
    const { artifacts } = await resolveFixtureSession();
    const agent = artifacts.find(
      (a) => a.type === "agent" && a.name === "doc-writer",
    );
    expect(agent).toBeDefined();
    expect(agent?.content).toContain("Doc Writer");
  });

  it("notes built-in agents in coverage without warning", async () => {
    const { artifacts, coverage, warnings } = await resolveFixtureSession();
    expect(artifacts.some((a) => a.name === "Explore")).toBe(false);
    const entry = coverage.find((c) => c.ref === "Explore");
    expect(entry?.resolved).toBe(false);
    expect(entry?.note).toContain("built-in");
    expect(warnings.some((w) => w.includes("Explore"))).toBe(false);
  });

  it("resolves project rules at the project dir", async () => {
    const { artifacts } = await resolveFixtureSession();
    const rules = artifacts.filter((a) => a.type === "project-rules");
    const names = rules.map((r) => r.name);
    expect(names).toContain("CLAUDE.md");
    expect(names).toContain("AGENTS.md");
  });

  it("finds project rules from a nested cwd by walking to the project root", async () => {
    const { artifacts } = await resolveArtifacts(emptyTrace({ cwd: nestedDir }), {
      projectRoot: fixtureProject,
      env: { MOOSE_TRACEVALS_HOME: fixtureHome },
    });
    const rules = artifacts.filter((a) => a.type === "project-rules");
    expect(rules.some((r) => r.name === "CLAUDE.md")).toBe(true);
  });

  it("degrades unresolved refs to coverage entries and warnings", async () => {
    const { artifacts, coverage, warnings } = await resolveArtifacts(
      emptyTrace({
        skillInvocations: [{ name: "ghost-skill", via: "skill-tool" }],
      }),
      { env: { MOOSE_TRACEVALS_HOME: fixtureHome } },
    );
    expect(artifacts.some((a) => a.name === "ghost-skill")).toBe(false);
    const entry = coverage.find((c) => c.ref === "ghost-skill");
    expect(entry?.resolved).toBe(false);
    expect(entry?.tried.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("ghost-skill"))).toBe(true);
  });

  it("dedupes artifacts resolved through multiple refs", async () => {
    const trace = emptyTrace({
      skillInvocations: [
        { name: "fix-bug", via: "skill-tool" },
        { name: "fix-bug", via: "command-injection" },
      ],
    });
    const { artifacts } = await resolveArtifacts(trace, {
      env: { MOOSE_TRACEVALS_HOME: fixtureHome },
    });
    expect(artifacts.filter((a) => a.name === "fix-bug")).toHaveLength(1);
  });
});
