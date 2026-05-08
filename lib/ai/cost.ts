// lib/ai/cost.ts

const USD_TO_GBP = 0.79; // approx; updated manually if drift matters

export function estimateCostGbp(
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  pricing: { promptUsdPerMillion: number; completionUsdPerMillion: number } | null,
): number | undefined {
  if (!pricing) return undefined;
  if (promptTokens === undefined && completionTokens === undefined) return undefined;
  const promptUsd =
    ((promptTokens ?? 0) / 1_000_000) * pricing.promptUsdPerMillion;
  const completionUsd =
    ((completionTokens ?? 0) / 1_000_000) * pricing.completionUsdPerMillion;
  return (promptUsd + completionUsd) * USD_TO_GBP;
}
