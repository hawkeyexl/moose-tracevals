/**
 * Judge-provider construction: hand agentevals' provider config section to
 * docevals' parseConfig/makeProvider (anthropic / openai / claude-cli), with a
 * fourth name `mock` that short-circuits to docevals' MockProvider for
 * zero-network pipeline runs.
 */
import { stringify as stringifyYaml } from "yaml";
import {
  makeProvider,
  MockProvider,
  mockVerdict,
  parseConfig as parseDocevalsConfig,
  type JudgeProvider,
} from "docevals";
import { AgentevalsError } from "../types.js";
import type { AgentevalsConfig } from "../core/config.js";

/** docevals declares this shape but does not export the type. */
export type MockResponse = ConstructorParameters<typeof MockProvider>[0][number];

export function makeJudgeProvider(
  config: AgentevalsConfig,
  options: {
    provider?: string;
    model?: string;
    /**
     * Responses for the `mock` provider. The default is verdict-shaped, which
     * suits judging; callers with a different response schema (criteria
     * proposals, say) must supply their own.
     */
    mockResponses?: MockResponse[];
  } = {},
): JudgeProvider {
  const name =
    options.provider ??
    (config.provider.default as string | undefined) ??
    "claude-cli";
  if (name === "mock") {
    return new MockProvider(
      options.mockResponses ?? [mockVerdict("pass", 0.95)],
    );
  }
  try {
    // docevals' parseConfig takes YAML text; serialize the provider section.
    const docevalsConfig = parseDocevalsConfig(
      stringifyYaml({ provider: { ...config.provider, default: name } }),
      "agentevals.config.yaml#provider",
    );
    return makeProvider(docevalsConfig, {
      provider: name as never,
      ...(options.model !== undefined ? { model: options.model } : {}),
    });
  } catch (err) {
    throw new AgentevalsError(
      `could not construct judge provider "${name}": ${(err as Error).message}`,
    );
  }
}
