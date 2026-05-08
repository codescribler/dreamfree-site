// convex/aiModelPricing.ts
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";

interface OpenRouterModel {
  id: string;
  pricing?: { prompt?: string; completion?: string };
}

export const refreshPricing = internalAction({
  args: {},
  handler: async (ctx) => {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) {
      console.error(`refreshPricing: HTTP ${res.status}`);
      return;
    }
    const json = (await res.json()) as { data?: OpenRouterModel[] };
    const models = json.data ?? [];
    const records = models
      .map((m) => {
        const promptStr = m.pricing?.prompt;
        const completionStr = m.pricing?.completion;
        if (!promptStr || !completionStr) return null;
        const promptUsd = Number(promptStr) * 1_000_000;
        const completionUsd = Number(completionStr) * 1_000_000;
        if (!Number.isFinite(promptUsd) || !Number.isFinite(completionUsd)) {
          return null;
        }
        return {
          model: m.id,
          promptUsdPerMillion: promptUsd,
          completionUsdPerMillion: completionUsd,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    await ctx.runMutation(internal.aiModelPricing.bulkUpsertPricing, {
      records,
    });
    console.log(`refreshPricing: stored ${records.length} model prices`);
  },
});

export const bulkUpsertPricing = internalMutation({
  args: {
    records: v.array(
      v.object({
        model: v.string(),
        promptUsdPerMillion: v.number(),
        completionUsdPerMillion: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const r of args.records) {
      const existing = await ctx.db
        .query("aiModelPricing")
        .withIndex("by_model", (q) => q.eq("model", r.model))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          promptUsdPerMillion: r.promptUsdPerMillion,
          completionUsdPerMillion: r.completionUsdPerMillion,
          fetchedAt: now,
        });
      } else {
        await ctx.db.insert("aiModelPricing", {
          model: r.model,
          promptUsdPerMillion: r.promptUsdPerMillion,
          completionUsdPerMillion: r.completionUsdPerMillion,
          fetchedAt: now,
        });
      }
    }
  },
});

export const getPricing = internalQuery({
  args: { model: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiModelPricing")
      .withIndex("by_model", (q) => q.eq("model", args.model))
      .unique();
    if (!row) return null;
    return {
      promptUsdPerMillion: row.promptUsdPerMillion,
      completionUsdPerMillion: row.completionUsdPerMillion,
    };
  },
});
