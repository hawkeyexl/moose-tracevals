/**
 * Self-preference: the judge model is the model that ran the session.
 *
 * This is the sharpest form of the bias in either moose tool. docevals asks a
 * model whether a document it may have drafted is any good; here the question
 * is whether the model's *own session* followed the rules it was given, and a
 * model grading its own conduct is not a neutral judge.
 *
 * It stays a warning. Bias skews a verdict; it does not stop one forming, so
 * the "no verdict fails" rule is not in play — and erroring would punish a
 * setup with only one model configured.
 */
import { describe, expect, it } from "vitest";
import { MockProvider, mockVerdict } from "@hawkeyexl/inference";
import { makeTraceJudge } from "../../src/judge/trace-judge.js";
import { makePlan, makeTrace } from "../helpers.js";

const plan = () => makePlan({ grader: "ai", assertion: "The session behaved." });

const judgeWith = async (judgeModel: string, sessionModel?: string) => {
  const judge = makeTraceJudge({
    provider: new MockProvider(
      [mockVerdict("pass", 0.95), mockVerdict("pass", 0.95), mockVerdict("pass", 0.95)],
      judgeModel,
    ),
    cacheDir: undefined,
    noCache: true,
  });
  const results = await judge([plan()], "rendered transcript", {
    trace: makeTrace(sessionModel === undefined ? {} : { model: sessionModel }),
  });
  return results[0];
};

describe("self-preference (session axis)", () => {
  it("flags a judge grading its own session", async () => {
    const r = await judgeWith("claude-sonnet-4-5", "claude-sonnet-4-5");
    expect(r?.selfPreference).toEqual({
      axis: "session",
      model: "claude-sonnet-4-5",
    });
    // A real verdict still forms; the bias rides alongside it.
    expect(r?.outcome).toBe("pass");
  });

  it("does not flag a different judge", async () => {
    const r = await judgeWith("judge-model", "claude-sonnet-4-5");
    expect(r?.selfPreference).toBeUndefined();
  });

  it("does not guess when the trace records no model", async () => {
    // Some adapters do not carry one. Unknown is unknown — it must not read as
    // "not the same model", which would be a silent all-clear.
    const r = await judgeWith("judge-model", undefined);
    expect(r?.selfPreference).toBeUndefined();
  });
});
