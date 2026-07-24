import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockProvider, mockVerdict } from "docevals";
import { makeTraceJudge } from "../../src/judge/trace-judge.js";
import { cacheKey } from "../../src/judge/cache.js";
import { makePlan } from "../helpers.js";

let tmpDir: string;
beforeAll(async () => {
  // .tmp/ is gitignored, so a fresh checkout won't have it yet.
  await mkdir(".tmp", { recursive: true });
  tmpDir = await mkdtemp(join(".tmp", "judge-"));
});
afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const plan = makePlan({ grader: "llm" });

describe("makeTraceJudge", () => {
  it("passes on a unanimous high-confidence ensemble", async () => {
    const judge = makeTraceJudge({
      provider: new MockProvider([mockVerdict("pass", 0.95)]),
      runs: 3,
      noCache: true,
    });
    const [result] = await judge([plan], "trace text");
    expect(result?.outcome).toBe("pass");
    expect(result?.consensus?.zone).toBe("auto-pass");
    expect(result?.consensus?.votes.pass).toBe(3);
  });

  it("fails on a unanimous high-confidence fail", async () => {
    const judge = makeTraceJudge({
      provider: new MockProvider([mockVerdict("fail", 0.9)]),
      runs: 3,
      noCache: true,
    });
    const [result] = await judge([plan], "trace text");
    expect(result?.outcome).toBe("fail");
  });

  it("routes split ensembles to needs-review", async () => {
    const judge = makeTraceJudge({
      provider: new MockProvider([
        mockVerdict("pass", 0.9),
        mockVerdict("fail", 0.9),
        mockVerdict("pass", 0.9),
      ]),
      runs: 3,
      noCache: true,
    });
    const [result] = await judge([plan], "trace text");
    expect(result?.outcome).toBe("needs-review");
  });

  it("counts errored runs against consensus — never a silent pass", async () => {
    const judge = makeTraceJudge({
      provider: new MockProvider([
        mockVerdict("pass", 0.95),
        { error: "boom" },
        { error: "boom" },
        mockVerdict("pass", 0.95),
        { error: "boom" },
        { error: "boom" },
      ]),
      runs: 3,
      noCache: true,
    });
    const [result] = await judge([plan], "trace text");
    expect(result?.outcome).toBe("needs-review");
    expect(result?.consensus?.votes.error).toBeGreaterThan(0);
  });

  it("retries once on an invalid verdict, then records an errored run", async () => {
    const judge = makeTraceJudge({
      provider: new MockProvider([
        { json: { not: "a verdict" } },
        mockVerdict("pass", 0.95),
      ]),
      runs: 1,
      noCache: true,
    });
    const [result] = await judge([plan], "trace text");
    expect(result?.outcome).toBe("pass");
  });

  it("replays cached ensembles instead of re-asking the provider", async () => {
    const cacheDir = join(tmpDir, "cache");
    const first = makeTraceJudge({
      provider: new MockProvider([mockVerdict("pass", 0.95)]),
      runs: 2,
      cacheDir,
    });
    await first([plan], "same trace");

    const second = makeTraceJudge({
      provider: new MockProvider([mockVerdict("fail", 0.95)]),
      runs: 2,
      cacheDir,
    });
    const [result] = await second([plan], "same trace");
    expect(result?.outcome).toBe("pass");
    expect(result?.consensus?.runs.every((r) => r.cached)).toBe(true);
  });

  it("skips evals once the cost budget is exhausted", async () => {
    const judge = makeTraceJudge({
      provider: new MockProvider([mockVerdict("pass", 0.95)]),
      runs: 1,
      noCache: true,
      maxCostUsd: 0,
    });
    const [result] = await judge([plan], "trace text");
    expect(result?.outcome).toBe("skipped");
    expect(result?.skipReason).toContain("budget");
  });
});

describe("cacheKey", () => {
  it("misses when the prompt version changes", () => {
    const a = cacheKey("mock", "m", 3, 0, "trace", plan, 1);
    const b = cacheKey("mock", "m", 3, 0, "trace", plan, 2);
    expect(a).not.toBe(b);
  });

  it("misses when the trace or plan changes", () => {
    const base = cacheKey("mock", "m", 3, 0, "trace", plan);
    expect(cacheKey("mock", "m", 3, 0, "other", plan)).not.toBe(base);
    expect(
      cacheKey("mock", "m", 3, 0, "trace", makePlan({ assertion: "different" })),
    ).not.toBe(base);
  });
});
