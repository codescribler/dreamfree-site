// scripts/check-cost.ts
import { estimateCostGbp } from "../lib/ai/cost";

function assertEqual(actual: number | undefined, expected: number, label: string) {
  if (actual === undefined || Math.abs(actual - expected) > 1e-6) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const pricing = { promptUsdPerMillion: 1.0, completionUsdPerMillion: 2.0 };

// 1M prompt tokens at $1/M = $1, 1M completion at $2/M = $2, total $3 × 0.79 = £2.37
assertEqual(estimateCostGbp(1_000_000, 1_000_000, pricing), 2.37, "basic");

// Missing pricing → undefined
if (estimateCostGbp(100, 100, null) !== undefined) {
  throw new Error("null pricing should return undefined");
}

// Both tokens missing → undefined
if (estimateCostGbp(undefined, undefined, pricing) !== undefined) {
  throw new Error("missing tokens should return undefined");
}

console.log("cost helper OK");
