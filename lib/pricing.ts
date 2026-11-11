import type { LanguageModelUsage } from "ai";

/** USD per 1M tokens. Output includes thinking tokens. */
type Price = { from: string; input: number; cachedInput: number; output: number };

/**
 * Price history per model id (`provider:model`), oldest first. The entry whose
 * `from` date is the latest one not after the call is used, so scheduled price
 * changes can be entered ahead of time.
 * Source: https://ai.google.dev/gemini-api/docs/pricing (standard paid tier).
 */
const PRICES: Record<string, Price[]> = {
  "google:gemini-3.8-flash": [
    { from: "2026-01-01", input: 0.75, cachedInput: 0.075, output: 3.75 },
    { from: "2027-01-01", input: 1.5, cachedInput: 0.15, output: 7.5 },
  ],
};

export type TokenCounts = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export function toTokenCounts(usage: LanguageModelUsage): TokenCounts {
  return {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}

/** Cost in USD, or null when the model has no price entry (spend then shows as unpriced). */
export function costUsd(modelId: string, t: TokenCounts, at = new Date()): number | null {
  const day = at.toISOString().slice(0, 10);
  const price = PRICES[modelId]?.filter((p) => p.from <= day).at(-1);
  if (!price) return null;
  const freshInput = Math.max(0, t.inputTokens - t.cachedInputTokens);
  return (
    (freshInput * price.input +
      t.cachedInputTokens * price.cachedInput +
      t.outputTokens * price.output) /
    1_000_000
  );
}
