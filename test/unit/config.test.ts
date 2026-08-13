import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, parseConfig } from "../../src/core/config.js";
import { TracevalsError } from "../../src/types.js";

describe("parseConfig", () => {
  it("fills every default from an empty config", () => {
    const config = parseConfig({});
    expect(config.judge.ensembleRuns).toBe(3);
    expect(config.judge.temperature).toBe(0);
    expect(config.judge.zones).toEqual({ autoPass: 0.8, autoFail: 0.8 });
    expect(config.judge.cacheDir).toBe(".moose-tracevals/cache");
    expect(config.render.maxBlockChars).toBe(2000);
    expect(config.render.maxTotalChars).toBe(150000);
    expect(config.history.file).toBe(".moose-tracevals/history.jsonl");
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
    expect(config.fill.cacheDir).toBe(".moose-tracevals/cache/fill");
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

describe("loadConfig", () => {
  let dir: string;

  beforeEach(async () => {
    // .tmp/ is gitignored, so a fresh checkout won't have it yet.
    await mkdir(".tmp", { recursive: true });
    dir = await mkdtemp(join(".tmp", "config-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const write = (name: string, body: string) =>
    writeFile(join(dir, name), body, "utf-8");

  it("reads settings from the tracevals section of moose.config.yaml", async () => {
    await write(
      "moose.config.yaml",
      "tracevals:\n  judge:\n    ensembleRuns: 5\n  failOnNeedsReview: false\n",
    );
    const config = await loadConfig(dir);
    expect(config.judge.ensembleRuns).toBe(5);
    expect(config.failOnNeedsReview).toBe(false);
    // Untouched sections still get their defaults.
    expect(config.judge.temperature).toBe(0);
  });

  it("ignores sibling sections owned by other tools in the family", async () => {
    // The whole point of the shared file: docevals/docmeta keys are none of
    // our business and must not trip `additionalProperties: false`.
    await write(
      "moose.config.yaml",
      [
        "docevals:",
        "  judge:",
        "    ensembleRuns: 99",
        "docmeta:",
        "  schemas: [a, b]",
        "tracevals:",
        "  judge:",
        "    ensembleRuns: 5",
      ].join("\n") + "\n",
    );
    const config = await loadConfig(dir);
    expect(config.judge.ensembleRuns).toBe(5);
  });

  it("returns defaults when the file is absent", async () => {
    const config = await loadConfig(dir);
    expect(config.judge.ensembleRuns).toBe(3);
  });

  it("returns defaults when the file holds only other tools' sections", async () => {
    await write("moose.config.yaml", "docmeta:\n  schemas: [a]\n");
    const config = await loadConfig(dir);
    expect(config.judge.ensembleRuns).toBe(3);
  });

  it("rejects tracevals keys left at the top level instead of nested", async () => {
    // Silently defaulting here would discard the author's entire config.
    await write("moose.config.yaml", "judge:\n  ensembleRuns: 5\n");
    await expect(loadConfig(dir)).rejects.toThrow(TracevalsError);
    await expect(loadConfig(dir)).rejects.toThrow(/tracevals:/);
  });

  it("rejects a lone legacy moose-tracevals.config.yaml", async () => {
    await write("moose-tracevals.config.yaml", "judge:\n  ensembleRuns: 5\n");
    await expect(loadConfig(dir)).rejects.toThrow(TracevalsError);
    await expect(loadConfig(dir)).rejects.toThrow(/moose\.config\.yaml/);
  });

  it("validates the tracevals section", async () => {
    await write("moose.config.yaml", "tracevals:\n  judge:\n    ensembleRuns: 0\n");
    await expect(loadConfig(dir)).rejects.toThrow(TracevalsError);
  });

  it("reports an unparseable file by path", async () => {
    await write("moose.config.yaml", "tracevals:\n  judge: [unclosed\n");
    await expect(loadConfig(dir)).rejects.toThrow(/could not parse/);
  });

  it("rejects a section key that is only miscased", async () => {
    // Nested correctly, but under `Tracevals:`, so the stray-key scan finds
    // nothing at the top level and every value would be lost silently.
    await write(
      "moose.config.yaml",
      ["Tracevals:", "  judge:", "    ensembleRuns: 5"].join("\n") + "\n",
    );
    await expect(loadConfig(dir)).rejects.toThrow(TracevalsError);
    await expect(loadConfig(dir)).rejects.toThrow(/Tracevals/);
  });

  it("surfaces a config that exists but cannot be read", async () => {
    // A directory by that name stands in for any non-ENOENT failure; calling
    // it "absent" would run on defaults with a config sitting right there.
    await mkdir(join(dir, "moose.config.yaml"), { recursive: true });
    await expect(loadConfig(dir)).rejects.toThrow(TracevalsError);
    await expect(loadConfig(dir)).rejects.toThrow(/could not read/);
  });

  it("does not blame the legacy file when the new one is unreadable", async () => {
    await mkdir(join(dir, "moose.config.yaml"), { recursive: true });
    await write("moose-tracevals.config.yaml", "judge:\n  ensembleRuns: 5\n");
    await expect(loadConfig(dir)).rejects.not.toThrow(/no moose\.config\.yaml/);
  });

  it("rejects a file whose root is not a mapping", async () => {
    await write("moose.config.yaml", "- one\n- two\n");
    await expect(loadConfig(dir)).rejects.toThrow(TracevalsError);
  });
});
