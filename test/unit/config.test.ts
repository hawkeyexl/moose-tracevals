import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/core/config.js";
import { TracevalsError } from "../../src/types.js";

describe("parseConfig", () => {
  it("fills every default from an empty config", () => {
    const config = parseConfig({});
    expect(config.judge.ensembleRuns).toBe(3);
    expect(config.judge.temperature).toBe(0);
    expect(config.judge.zones).toEqual({ autoPass: 0.8, autoFail: 0.8 });
    expect(config.judge.cacheDir).toBe(".tracevals/cache");
    expect(config.render.maxBlockChars).toBe(2000);
    expect(config.render.maxTotalChars).toBe(150000);
    expect(config.history.file).toBe(".tracevals/history.jsonl");
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
    expect(config.fill.cacheDir).toBe(".tracevals/cache/fill");
    expect(config.fill.maxCostUsd).toBeUndefined();

    const explicit = parseConfig({ fill: { confidenceThreshold: 0.5, maxCostUsd: 2 } });
    expect(explicit.fill.confidenceThreshold).toBe(0.5);
    expect(explicit.fill.maxCostUsd).toBe(2);
    expect(explicit.fill.maxCriteriaPerArtifact).toBe(8);
  });

  it("rejects out-of-range and unknown fill keys", () => {
    expect(() => parseConfig({ fill: { confidenceThreshold: 2 } })).toThrow(
      TracevalsError,
    );
    expect(() => parseConfig({ fill: { maxCriteriaPerArtifact: 0 } })).toThrow(
      TracevalsError,
    );
    expect(() => parseConfig({ fill: { bogus: true } })).toThrow(TracevalsError);
  });

  it("rejects invalid configs with an operational error", () => {
    expect(() => parseConfig({ judge: { ensembleRuns: 0 } })).toThrow(
      TracevalsError,
    );
    expect(() => parseConfig({ unknownKey: true })).toThrow(TracevalsError);
  });

  describe("provider section", () => {
    it("defaults to claude-cli so a fresh checkout needs no API key", () => {
      const config = parseConfig({});
      expect(config.provider.default).toBe("claude-cli");
      expect(config.provider["claude-cli"]).toEqual({
        model: "claude-sonnet-4-5",
        command: "claude",
      });
    });

    it("fills per-provider defaults for sections that were not configured", () => {
      const config = parseConfig({ provider: { default: "anthropic" } });
      expect(config.provider.anthropic).toEqual({
        model: "claude-sonnet-4-5",
        apiKeyEnv: "ANTHROPIC_API_KEY",
      });
      expect(config.provider.openai.baseUrl).toBe("https://api.openai.com/v1");
    });

    it("keeps explicit provider values, including a pricing override", () => {
      const config = parseConfig({
        provider: {
          default: "openai",
          openai: {
            baseUrl: "http://localhost:11434/v1",
            model: "qwen2.5",
            pricing: { inputPerMTok: 0, outputPerMTok: 0 },
          },
        },
      });
      expect(config.provider.openai.baseUrl).toBe("http://localhost:11434/v1");
      expect(config.provider.openai.model).toBe("qwen2.5");
      expect(config.provider.openai.pricing).toEqual({
        inputPerMTok: 0,
        outputPerMTok: 0,
      });
      // Untouched sections still get their defaults.
      expect(config.provider.anthropic.model).toBe("claude-sonnet-4-5");
    });

    it("rejects a typo'd provider name instead of silently defaulting", () => {
      // This section used to be an untyped passthrough, so `default: antropic`
      // or a misspelled section name sailed through validation and the run
      // quietly used a different provider than the author intended.
      expect(() => parseConfig({ provider: { default: "antropic" } })).toThrow(
        TracevalsError,
      );
      expect(() =>
        parseConfig({ provider: { anthropc: { model: "x" } } }),
      ).toThrow(TracevalsError);
    });

    it("rejects a typo'd key inside a provider section", () => {
      expect(() =>
        parseConfig({ provider: { anthropic: { modl: "x" } } }),
      ).toThrow(TracevalsError);
    });

    it("rejects an empty apiKeyEnv", () => {
      expect(() =>
        parseConfig({ provider: { anthropic: { apiKeyEnv: "" } } }),
      ).toThrow(TracevalsError);
    });

    it("rejects a half-specified pricing override", () => {
      expect(() =>
        parseConfig({
          provider: { anthropic: { pricing: { inputPerMTok: 3 } } },
        }),
      ).toThrow(TracevalsError);
    });
  });
});
