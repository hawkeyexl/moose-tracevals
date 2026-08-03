/**
 * The config → ProviderSpec mapping. This replaced a YAML round-trip through
 * docevals' config parser, so these tests pin the shape the inference library
 * actually receives.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveProviderIdentity } from "@hawkeyexl/inference";
import { parseConfig } from "../../src/core/config.js";
import { makeJudgeProvider, providerSpecFor } from "../../src/judge/provider.js";
import { AgentevalsError } from "../../src/types.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("providerSpecFor", () => {
  it("maps the anthropic section", () => {
    const config = parseConfig({
      provider: {
        default: "anthropic",
        anthropic: { model: "claude-haiku-4-5", apiKeyEnv: "MY_KEY" },
      },
    });
    expect(providerSpecFor(config, "anthropic")).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKeyEnv: "MY_KEY",
    });
  });

  it("maps the openai section including baseUrl", () => {
    const config = parseConfig({
      provider: { openai: { baseUrl: "http://localhost:11434/v1" } },
    });
    const spec = providerSpecFor(config, "openai");
    expect(spec.baseUrl).toBe("http://localhost:11434/v1");
    expect(spec.provider).toBe("openai");
  });

  it("maps the claude-cli section including the command", () => {
    const config = parseConfig({
      provider: { "claude-cli": { command: "claude-next" } },
    });
    expect(providerSpecFor(config, "claude-cli")).toEqual({
      provider: "claude-cli",
      model: "claude-sonnet-4-5",
      command: "claude-next",
    });
  });

  it("carries a pricing override through to the spec", () => {
    const config = parseConfig({
      provider: {
        anthropic: { pricing: { inputPerMTok: 1, outputPerMTok: 2 } },
      },
    });
    expect(providerSpecFor(config, "anthropic").pricing).toEqual({
      inputPerMTok: 1,
      outputPerMTok: 2,
    });
  });

  it("omits pricing entirely when none is configured", () => {
    const spec = providerSpecFor(parseConfig({}), "anthropic");
    expect("pricing" in spec).toBe(false);
  });

  it("lets an explicit model override the configured one", () => {
    const config = parseConfig({
      provider: { anthropic: { model: "claude-sonnet-4-5" } },
    });
    expect(providerSpecFor(config, "anthropic", { model: "gpt-4o" }).model).toBe(
      "gpt-4o",
    );
  });

  it("resolves a model for every provider, so no cache key carries an empty one", () => {
    // The hand-rolled identity lookup this replaced fell back to "" when a
    // section had no explicit model, so the cache key recorded an empty model
    // while the request used the provider default — a cached proposal could
    // then be replayed for a model that never produced it.
    const config = parseConfig({});
    for (const name of ["anthropic", "openai", "claude-cli", "mock"] as const) {
      const { model } = resolveProviderIdentity(providerSpecFor(config, name));
      expect(model).not.toBe("");
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

describe("makeJudgeProvider", () => {
  it("builds the mock provider without touching the network or a key", () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const provider = makeJudgeProvider(parseConfig({}), { provider: "mock" });
    expect(provider.provider()).toBe("mock");
  });

  it("defaults to claude-cli when nothing selects a provider", () => {
    const provider = makeJudgeProvider(parseConfig({}));
    expect(provider.provider()).toBe("claude-cli");
  });

  it("honours the configured default", () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    const config = parseConfig({ provider: { default: "anthropic" } });
    expect(makeJudgeProvider(config).provider()).toBe("anthropic");
  });

  it("wraps a construction failure as an operational error", () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const config = parseConfig({ provider: { default: "anthropic" } });
    expect(() => makeJudgeProvider(config)).toThrow(AgentevalsError);
    expect(() => makeJudgeProvider(config)).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("rejects an unknown --provider value from the CLI", () => {
    // Config is schema-constrained, but the CLI flag is free text.
    expect(() =>
      makeJudgeProvider(parseConfig({}), { provider: "gemini" }),
    ).toThrow(AgentevalsError);
  });

  it("seeds the mock with caller-supplied responses", async () => {
    const provider = makeJudgeProvider(parseConfig({}), {
      provider: "mock",
      mockResponses: [{ json: { custom: true } }],
    });
    const response = await provider.completeJSON({
      system: "s",
      user: "u",
      schema: {},
      temperature: 0,
    });
    expect(response.json).toEqual({ custom: true });
  });
});
