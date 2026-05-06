import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
const sectionValidator = v.union(v.literal("character"), v.literal("problem"), v.literal("guide"), v.literal("plan"), v.literal("cta"), v.literal("stakes"), v.literal("transformation"));
/** All insights for a section, newest first. */
export const listBySection = query({
    args: { section: sectionValidator },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("signalInsights")
            .withIndex("by_section_and_createdAt", (q) => q.eq("section", args.section))
            .order("desc")
            .collect();
    },
});
/** Latest N successful reports projected to one section. */
export const latestReportsForSection = query({
    args: {
        section: sectionValidator,
        count: v.number(),
    },
    handler: async (ctx, args) => {
        const limit = Math.max(1, Math.min(args.count, 100));
        const reports = await ctx.db
            .query("signalReports")
            .withIndex("by_status", (q) => q.eq("status", "success"))
            .order("desc")
            .take(limit);
        return reports.map((report) => ({
            _id: report._id,
            url: report.url,
            customerDescription: report.customerDescription,
            overallScore: report.overallScore,
            sectionData: report.elements[args.section],
        }));
    },
});
/** Insert a new insight row. */
export const insertInsight = mutation({
    args: {
        section: sectionValidator,
        reportCount: v.number(),
        reportsAnalysed: v.array(v.id("signalReports")),
        summary: v.string(),
        contentIdeas: v.array(v.object({
            hook: v.string(),
            angle: v.string(),
            format: v.optional(v.string()),
        })),
        modelUsed: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("signalInsights", {
            ...args,
            createdAt: Date.now(),
        });
    },
});
