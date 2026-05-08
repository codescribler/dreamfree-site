import { v } from "convex/values";
import { mutation, query, internalQuery, type QueryCtx } from "./_generated/server";
import { USE_CASES, type UseCase } from "../lib/ai/use-cases";
import {
  OPENROUTER_MODEL_PRIMARY,
  OPENROUTER_MODEL_FALLBACK,
} from "../lib/signal-prompt";

/**
 * Resolves the primary+fallback OpenRouter model slugs for a given use case.
 * Order: explicit row → "default" row → hardcoded constants in lib/signal-prompt.ts.
 */
export async function resolveModels(
  ctx: QueryCtx,
  useCase: UseCase,
): Promise<{ primary: string; fallback: string }> {
  const explicit = await ctx.db
    .query("aiModelConfig")
    .withIndex("by_useCase", (q) => q.eq("useCase", useCase))
    .unique();
  if (explicit) {
    return { primary: explicit.primary, fallback: explicit.fallback };
  }

  if (useCase !== "default") {
    const fallthrough = await ctx.db
      .query("aiModelConfig")
      .withIndex("by_useCase", (q) => q.eq("useCase", "default"))
      .unique();
    if (fallthrough) {
      return {
        primary: fallthrough.primary,
        fallback: fallthrough.fallback,
      };
    }
  }

  return {
    primary: OPENROUTER_MODEL_PRIMARY,
    fallback: OPENROUTER_MODEL_FALLBACK,
  };
}

export const resolveModelsInternal = internalQuery({
  args: { useCase: v.string() },
  handler: async (ctx, args) => {
    if (!(USE_CASES as readonly string[]).includes(args.useCase)) {
      throw new Error(`Unknown use-case: ${args.useCase}`);
    }
    return resolveModels(ctx, args.useCase as UseCase);
  },
});

export const listConfig = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("aiModelConfig").collect();
    return USE_CASES.map((useCase) => {
      const row = rows.find((r) => r.useCase === useCase);
      return {
        useCase,
        primary: row?.primary ?? null,
        fallback: row?.fallback ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  },
});

export const setConfig = mutation({
  args: {
    useCase: v.string(),
    primary: v.string(),
    fallback: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const useCase = args.useCase;
    if (!(USE_CASES as readonly string[]).includes(useCase)) {
      throw new Error(`Unknown use-case: ${useCase}`);
    }
    const trimmedPrimary = args.primary.trim();
    const trimmedFallback = args.fallback.trim();
    if (!trimmedPrimary || !trimmedFallback) {
      throw new Error("Primary and fallback are both required");
    }

    const existing = await ctx.db
      .query("aiModelConfig")
      .withIndex("by_useCase", (q) => q.eq("useCase", useCase))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        primary: trimmedPrimary,
        fallback: trimmedFallback,
        updatedAt: Date.now(),
        updatedBy: args.updatedBy,
      });
    } else {
      await ctx.db.insert("aiModelConfig", {
        useCase,
        primary: trimmedPrimary,
        fallback: trimmedFallback,
        updatedAt: Date.now(),
        updatedBy: args.updatedBy,
      });
    }
  },
});

export const clearConfig = mutation({
  args: { useCase: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("aiModelConfig")
      .withIndex("by_useCase", (q) => q.eq("useCase", args.useCase))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
