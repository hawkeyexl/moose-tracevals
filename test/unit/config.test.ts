import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/core/config.js";
import { AgentevalsError } from "../../src/types.js";

describe("parseConfig", () => {
  it("fills every default from an empty config", () => {
    const config = parseConfig({});
    expect(config.judge.ensembleRuns).toBe(3);
    expect(config.judge.temperature).toBe(0);
    expect(config.judge.zones).toEqual({ autoPass: 0.8, autoFail: 0.8 });
    expect(config.judge.cacheDir).toBe(".agentevals/cache");
    expect(config.render.maxBlockChars).toBe(2000);
    expect(config.render.maxTotalChars).toBe(150000);
    expect(config.history.file).toBe(".agentevals/history.jsonl");
    expect(config.failOnNeedsReview).toBe(true);
  });

  it("keeps explicit values", () => {
    const config = parseConfig({
      judge: { ensembleRuns: 5, maxCostUsd: 1.5 },
      failOnNeedsReview: false,
    });
    expect(config.judge.ensembleRuns).toBe(5);
    expect(config.judge.maxCostUsd).toBe(1.5);
    expect(config.failOnNeedsReview).toBe(false);
    // Untouched sections still get defaults.
    expect(config.judge.temperature).toBe(0);
  });

  it("fills fill defaults and honours explicit ones", () => {
    const config = parseConfig({});
    expect(config.fill.confidenceThreshold).toBe(0.7);
    expect(config.fill.maxCriteriaPerArtifact).toBe(8);
    expect(config.fill.temperature).toBe(0);
    expect(config.fill.cacheDir).toBe(".agentevals/cache/fill");
    expect(config.fill.maxCostUsd).toBeUndefined();

    const explicit = parseConfig({ fill: { confidenceThreshold: 0.5, maxCostUsd: 2 } });
    expect(explicit.fill.confidenceThreshold).toBe(0.5);
    expect(explicit.fill.maxCostUsd).toBe(2);
    expect(explicit.fill.maxCriteriaPerArtifact).toBe(8);
  });

  it("rejects out-of-range and unknown fill keys", () => {
    expect(() => parseConfig({ fill: { confidenceThreshold: 2 } })).toThrow(
      AgentevalsError,
    );
    expect(() => parseConfig({ fill: { maxCriteriaPerArtifact: 0 } })).toThrow(
      AgentevalsError,
    );
    expect(() => parseConfig({ fill: { bogus: true } })).toThrow(AgentevalsError);
  });

  it("rejects invalid configs with an operational error", () => {
    expect(() => parseConfig({ judge: { ensembleRuns: 0 } })).toThrow(
      AgentevalsError,
    );
    expect(() => parseConfig({ unknownKey: true })).toThrow(AgentevalsError);
  });
});
