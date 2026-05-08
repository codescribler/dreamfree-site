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

export const resolveModelsPublic = query({
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

import type { Doc } from "./_generated/dataModel";

interface ReplayableRecord {
  id: string;
  label: string;
  subLabel?: string;
  createdAt: number;
}

export const listReplayableRecords = query({
  args: {
    useCase: v.string(),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const search = args.search?.trim().toLowerCase() ?? "";

    if (args.useCase === "signal_reports") {
      const reports = await ctx.db
        .query("signalReports")
        .order("desc")
        .take(200);
      const leadIds = Array.from(new Set(reports.map((r) => r.leadId)));
      const leadMap = new Map<string, Doc<"leads"> | null>();
      for (const lid of leadIds) {
        leadMap.set(lid, await ctx.db.get(lid));
      }
      return reports
        .filter((r) => r.status === "success")
        .filter((r) => {
          if (search.length === 0) return true;
          const lead = leadMap.get(r.leadId);
          const email = lead?.email?.toLowerCase() ?? "";
          const url = r.url?.toLowerCase() ?? "";
          return email.includes(search) || url.includes(search);
        })
        .slice(0, limit)
        .map<ReplayableRecord>((r) => {
          const lead = leadMap.get(r.leadId);
          return {
            id: r._id,
            label: `${lead?.email ?? "unknown"} — ${r.url ?? "no url"}`,
            subLabel: `score ${r.overallScore ?? "?"} · ${new Date(r._creationTime).toLocaleDateString("en-GB")}`,
            createdAt: r._creationTime,
          };
        });
    }

    if (args.useCase === "signal_insights") {
      const insights = await ctx.db
        .query("signalInsights")
        .order("desc")
        .take(200);
      return insights
        .filter((i) => i.status === "complete")
        .filter((i) =>
          search.length === 0 ? true : i.section.toLowerCase().includes(search),
        )
        .slice(0, limit)
        .map<ReplayableRecord>((i) => ({
          id: i._id,
          label: `${i.section} insight`,
          subLabel: new Date(i._creationTime).toLocaleDateString("en-GB"),
          createdAt: i._creationTime,
        }));
    }

    if (args.useCase === "email_drafts") {
      const drafts = await ctx.db.query("emailDrafts").order("desc").take(200);
      const enrollmentIds = Array.from(new Set(drafts.map((d) => d.enrollmentId)));
      const enrollmentMap = new Map<string, Doc<"emailEnrollments"> | null>();
      for (const eid of enrollmentIds) {
        enrollmentMap.set(eid, await ctx.db.get(eid));
      }
      const leadIds = Array.from(
        new Set(
          [...enrollmentMap.values()]
            .filter((e): e is Doc<"emailEnrollments"> => e !== null)
            .map((e) => e.leadId),
        ),
      );
      const leadMap = new Map<string, Doc<"leads"> | null>();
      for (const lid of leadIds) {
        leadMap.set(lid, await ctx.db.get(lid));
      }
      return drafts
        .map((d) => {
          const enrollment = enrollmentMap.get(d.enrollmentId);
          const lead = enrollment ? leadMap.get(enrollment.leadId) : null;
          const email = lead?.email ?? "unknown";
          if (
            search.length > 0 &&
            !email.toLowerCase().includes(search) &&
            !d.role.toLowerCase().includes(search)
          ) {
            return null;
          }
          return {
            id: d._id,
            label: `${email} — role ${d.role}`,
            subLabel: new Date(d._creationTime).toLocaleDateString("en-GB"),
            createdAt: d._creationTime,
          } as ReplayableRecord;
        })
        .filter((d): d is ReplayableRecord => d !== null)
        .slice(0, limit);
    }

    if (args.useCase === "content_ideas") {
      const plans = await ctx.db.query("contentPlans").order("desc").take(200);
      return plans
        .filter((p) => {
          if (search.length === 0) return true;
          const email = p.input.email?.toLowerCase() ?? "";
          const desc = p.input.businessDescription?.toLowerCase() ?? "";
          return email.includes(search) || desc.includes(search);
        })
        .slice(0, limit)
        .map<ReplayableRecord>((p) => ({
          id: p._id,
          label: p.input.email || p.input.name || "unknown",
          subLabel: p.input.businessDescription?.slice(0, 80) ?? "",
          createdAt: p._creationTime,
        }));
    }

    throw new Error(`listReplayableRecords: unsupported useCase ${args.useCase}`);
  },
});
