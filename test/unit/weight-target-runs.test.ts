/**
 * The three per-eval fields `docmeta:artifact-evals:1.0.0-proposal.2` added:
 * `weight`, `target`, and `runs`.
 *
 * Each answers a different question, and the tests keep them apart:
 *
 * - `weight` changes how much an outcome moves the run's pass rate, and
 *   **never** the outcome itself.
 * - `target` changes which bytes a grader receives. It is a *subject*
 *   selector, so it composes with the narrowing options individual graders
 *   already carry (`regex`'s speaker `on`, `tool-usage`'s `includeSidechains`)
 *   rather than replacing them.
 * - `runs` changes how many ensemble runs one eval buys.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { MockProvider, mockVerdict } from "@hawkeyexl/inference";
import { graderFor } from "../../src/graders/registry.js";
import { makeTraceJudge } from "../../src/judge/trace-judge.js";
import { readTarget } from "../../src/core/target.js";
import { buildUserContent } from "../../src/judge/prompt.js";
import { makeArtifact, makePlan, makeRulesPlan, makeTrace } from "../helpers.js";

describe("target", () => {
  const trace = makeTrace({
    assistantTexts: ["first answer", "the final answer"],
    userMessages: ["please do the thing"],
    fileAccesses: [
      { path: "src/a.ts", op: "write", index: 0 },
      { path: "src/a.ts", op: "read", index: 1 },
      { path: "src/b.ts", op: "write", index: 2 },
    ],
  });
  const ctx = {
    trace,
    renderedTrace: "RENDERED",
    artifactContent: "ARTIFACT BODY",
    root: "/proj",
  };

  it("defaults to the rendered transcript", () => {
    const r = readTarget(undefined, ctx);
    expect(r).toEqual({ ok: true, text: "RENDERED", label: "transcript" });
  });

  it("last-message selects the final assistant text only", () => {
    const r = readTarget("last-message", ctx);
    expect(r.ok && r.text).toBe("the final answer");
  });

  it("last-message on a session that ended on a tool call is empty, not an error", () => {
    // A run with no assistant text genuinely has no final message. That is a
    // fact about the session, not a failure to read it.
    const r = readTarget("last-message", { ...ctx, trace: makeTrace({}) });
    expect(r).toEqual({ ok: true, text: "", label: "last-message" });
  });

  it("files gives deduplicated paths, never contents", () => {
    const r = readTarget("files", ctx);
    expect(r.ok && r.text).toBe("src/a.ts\nsrc/b.ts");
  });

  it("artifact selects the instruction artifact", () => {
    const r = readTarget("artifact", ctx);
    expect(r.ok && r.text).toBe("ARTIFACT BODY");
  });

  it("refuses a file target that climbs out of the project root", () => {
    const r = readTarget({ source: "file", path: "../../etc/passwd" }, ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("outside the project root");
  });

  it("refuses an absolute file target", () => {
    const r = readTarget({ source: "file", path: "/etc/passwd" }, ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("absolute path");
  });

  it("errors rather than silently grading something else when the file is missing", () => {
    const r = readTarget({ source: "file", path: "nope.txt" }, ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("could not be read");
  });

  it("does not mistake a leading-dots filename for a climb", () => {
    // `..rc` starts with two dots and goes nowhere. Rejecting it as an escape
    // would be a refusal the author cannot act on, since the file is inside
    // the root and named exactly what they wrote.
    const root = mkdtempSync(join(tmpdir(), "tracevals-target-"));
    writeFileSync(join(root, "..rc"), "inside the root\n");
    try {
      const r = readTarget(
        { source: "file", path: "..rc" },
        { ...ctx, root },
      );
      expect(r.ok).toBe(true);
      expect(r.ok && r.text).toContain("inside the root");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still refuses a climb that only returns to the root", () => {
    // `a/../../root` lands back inside, but only by leaving first. The guard
    // reads the resolved path, so this is a pass — the test pins that the
    // fix above did not widen into "any path containing dots is fine".
    const r = readTarget(
      { source: "file", path: `..${sep}outside.txt` },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("outside the project root");
  });
});

describe("target composes with a grader's own narrowing options", () => {
  const grader = graderFor("regex")!;
  const trace = makeTrace({
    assistantTexts: ["I edited the config"],
    userMessages: ["edit the config"],
    fileAccesses: [{ path: "src/generated.ts", op: "write", index: 3 }],
  });

  it("on picks the speaker within the transcript", async () => {
    // Unchanged behavior: `on` is a speaker axis and still works alone.
    const r = await grader.grade({
      trace,
      plan: makeRulesPlan({
        grader: "regex",
        options: { pattern: "^edit", on: "user" },
      }),
    });
    expect(r.findings).toEqual([]);
  });

  it("target picks the subject, which on cannot reach", async () => {
    // No message mentions the written path — only the file list does.
    const speakerOnly = await grader.grade({
      trace,
      plan: makeRulesPlan({
        grader: "regex",
        options: { pattern: "generated\\.ts", on: "all" },
      }),
    });
    expect(speakerOnly.findings).toHaveLength(1);

    const subject = await grader.grade({
      trace,
      plan: makeRulesPlan({
        grader: "regex",
        options: { pattern: "generated\\.ts" },
        target: "files",
      }),
    });
    expect(subject.findings).toEqual([]);
  });

  it("reports an unreachable target as an eval error, not a session failure", async () => {
    const r = await grader.grade({
      trace,
      plan: makeRulesPlan({
        grader: "regex",
        options: { pattern: "x" },
        target: { source: "file", path: "../escape.txt" },
      }),
    });
    expect(r.error).toContain("outside the project root");
    expect(r.findings).toEqual([]);
  });
});

describe("per-eval runs", () => {
  const judge = (runs?: number, cliRuns?: number) => {
    const provider = new MockProvider(
      Array.from({ length: 8 }, () => mockVerdict("pass", 0.95)),
      "judge-model",
    );
    const run = makeTraceJudge({
      provider,
      cacheDir: undefined,
      noCache: true,
      ...(cliRuns === undefined ? {} : { runs: cliRuns }),
    });
    const plan = makePlan({
      grader: "ai",
      assertion: "The session behaved.",
      ...(runs === undefined ? {} : { runs }),
    });
    return { provider, go: () => run([plan], () => "transcript", { trace: makeTrace({}) }) };
  };

  it("defaults to three", async () => {
    const { provider, go } = judge();
    await go();
    expect(provider.requests).toHaveLength(3);
  });

  it("honours a per-eval count", async () => {
    const { provider, go } = judge(1);
    await go();
    expect(provider.requests).toHaveLength(1);
  });

  it("lets an explicit --runs override the eval", async () => {
    const { provider, go } = judge(5, 2);
    await go();
    expect(provider.requests).toHaveLength(2);
  });
});

describe("the judge prompt under target", () => {
  const plan = makeRulesPlan({
    grader: "ai",
    assertion: "The rules were followed.",
    artifact: makeArtifact({
      name: "CLAUDE.md",
      type: "project-rules",
      path: "CLAUDE.md",
      content: "RULES BODY",
    }),
  });

  it("sends the artifact once when it is also the graded subject", () => {
    // Under `target: artifact` the source and the graded content are the same
    // bytes. Two copies cost tokens, invite the judge to reconcile them as two
    // documents, and defeat the truncation cap on the second copy.
    const user = buildUserContent(plan, "RULES BODY", "artifact");
    expect(user.split("RULES BODY")).toHaveLength(2);
    expect(user).not.toContain("# Source project-rules");
    expect(user).toContain("# Graded content: the project-rules");
  });

  it("still sends both when the subject is not the artifact", () => {
    const user = buildUserContent(plan, "THE TRANSCRIPT", "transcript");
    expect(user).toContain("# Source project-rules");
    expect(user).toContain("# Session transcript");
    expect(user).toContain("RULES BODY");
    expect(user).toContain("THE TRANSCRIPT");
  });
});

describe("per-eval model", () => {
  /** Records what the judge asked the factory to build. */
  const spyJudge = (planModel?: string, cliModel?: string) => {
    const asked: Array<{ name: string; model?: string }> = [];
    const judge = makeTraceJudge({
      provider: new MockProvider(
        Array.from({ length: 6 }, () => mockVerdict("pass", 0.95)),
        "default-model",
      ),
      providerFor: (name, model) => {
        asked.push({ name, ...(model === undefined ? {} : { model }) });
        return {
          provider: new MockProvider(
            Array.from({ length: 6 }, () => mockVerdict("pass", 0.95)),
            model ?? "default-model",
          ),
        };
      },
      ...(cliModel === undefined ? {} : { model: cliModel }),
      cacheDir: undefined,
      noCache: true,
    });
    const plan = makeRulesPlan({
      grader: "ai",
      assertion: "The session behaved.",
      ...(planModel === undefined ? {} : { model: planModel }),
    });
    return {
      asked,
      go: () => judge([plan], () => "transcript", { trace: makeTrace({}) }),
    };
  };

  it("builds a provider at the model the eval named", async () => {
    const { asked, go } = spyJudge("claude-opus-4-5");
    await go();
    expect(asked).toEqual([{ name: "mock", model: "claude-opus-4-5" }]);
  });

  it("does not build anything when the eval names the running model", async () => {
    const { asked, go } = spyJudge("default-model");
    await go();
    expect(asked).toEqual([]);
  });

  it("lets an explicit --model outrank the eval", async () => {
    // CLI > eval > default. The flag is already applied to the run's provider,
    // so honouring the eval here would silently undo what the operator typed.
    const { asked, go } = spyJudge("claude-opus-4-5", "claude-haiku-4-5");
    await go();
    expect(asked).toEqual([]);
  });
});
