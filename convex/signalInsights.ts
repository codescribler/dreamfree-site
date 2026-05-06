import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

const sectionValidator = v.union(
  v.literal("character"),
  v.literal("problem"),
  v.literal("guide"),
  v.literal("plan"),
  v.literal("cta"),
  v.literal("stakes"),
  v.literal("transformation"),
);

const MIN_REPORTS = 2;
const MAX_REPORTS = 100;

/** All insights for a section, newest first. */
export const listBySection = query({
  args: { section: sectionValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("signalInsights")
      .withIndex("by_section_and_createdAt", (q) =>
        q.eq("section", args.section),
      )
      .order("desc")
      .collect();
  },
});

/**
 * Create a pending insight row, capture which reports will be analysed,
 * and schedule the action that calls the LLM.
 *
 * Returns the new insightId immediately so the API route can return fast.
 * Throws if the user-supplied count is invalid or fewer than MIN_REPORTS
 * successful reports exist.
 */
export const enqueueGeneration = mutation({
  args: {
    section: sectionValidator,
    count: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.count) ||
      args.count < MIN_REPORTS ||
      args.count > MAX_REPORTS
    ) {
      throw new Error(`count must be an integer between ${MIN_REPORTS} and ${MAX_REPORTS}`);
    }

    // Capture the latest N successful reports for this section now,
    // so the action operates on a stable snapshot even if more reports
    // arrive between enqueue and execution.
    const reports = await ctx.db
      .query("signalReports")
      .withIndex("by_status", (q) => q.eq("status", "success"))
      .order("desc")
      .take(args.count);

    if (reports.length < MIN_REPORTS) {
      throw new Error(`not_enough_reports:${reports.length}`);
    }

    const insightId = await ctx.db.insert("signalInsights", {
      section: args.section,
      status: "pending",
      reportCount: reports.length,
      reportsAnalysed: reports.map((r) => r._id),
      summary: "",
      contentIdeas: [],
      modelUsed: "",
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.signalInsightsAction.runInsightGeneration,
      { insightId },
    );

    return insightId;
  },
});

/** Mark a pending insight as complete with the LLM output. */
export const completeInsight = internalMutation({
  args: {
    insightId: v.id("signalInsights"),
    summary: v.string(),
    contentIdeas: v.array(
      v.object({
        hook: v.string(),
        angle: v.string(),
        format: v.optional(v.string()),
      }),
    ),
    modelUsed: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.insightId, {
      status: "complete",
      summary: args.summary,
      contentIdeas: args.contentIdeas,
      modelUsed: args.modelUsed,
      completedAt: Date.now(),
    });
  },
});

/** Mark a pending insight as failed with an error message. */
export const failInsight = internalMutation({
  args: {
    insightId: v.id("signalInsights"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.insightId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });
  },
});

/** Internal: get a single insight by id (used by the action). */
export const getByIdInternal = internalQuery({
  args: { insightId: v.id("signalInsights") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.insightId);
  },
});

/** Internal: project a report to the fragment shape needed for the prompt. */
export const getReportsForInsight = internalQuery({
  args: { insightId: v.id("signalInsights") },
  handler: async (ctx, args) => {
    const insight = await ctx.db.get(args.insightId);
    if (!insight) return null;

    const reports = await Promise.all(
      insight.reportsAnalysed.map((id) => ctx.db.get(id)),
    );

    return {
      section: insight.section,
      reports: reports
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((report) => ({
          url: report.url,
          customerDescription: report.customerDescription,
          overallScore: report.overallScore,
          sectionData: report.elements[insight.section],
        })),
    };
  },
});
