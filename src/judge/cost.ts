/**
 * Provider pricing, shared by the ensemble judge and criteria authoring so a
 * cost budget means the same thing in both. Unknown models price at zero:
 * a budget cannot be enforced against a price we do not know, and guessing
 * would be worse than declining to guess.
 */

export interface Pricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

const PRICE_TABLE: Record<string, Pricing> = {
  "claude-sonnet-4-5": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-opus-4-8": { inputPerMTok: 15, outputPerMTok: 75 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
};

/** Longest matching prefix, so dated model ids (`-20250101`) still price. */
export function pricingFor(model: string): Pricing | undefined {
  const base = Object.keys(PRICE_TABLE)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return base === undefined ? undefined : PRICE_TABLE[base];
}

export function costOfUsage(
  usage: TokenUsage | undefined,
  pricing: Pricing | undefined,
): number {
  if (usage === undefined || pricing === undefined) return 0;
  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMTok +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}
