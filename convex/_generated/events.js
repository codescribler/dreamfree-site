import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
/** Log any event (page view, scroll depth, form submission, tool usage, etc). */
export const track = mutation({
    args: {
        type: v.string(),
        anonymousId: v.string(),
        sessionId: v.string(),
        path: v.string(),
        properties: v.optional(v.any()),
        leadId: v.optional(v.id("leads")),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("events", {
            type: args.type,
            anonymousId: args.anonymousId,
            sessionId: args.sessionId,
            path: args.path,
            properties: args.properties ?? {},
            leadId: args.leadId,
            timestamp: Date.now(),
        });
    },
});
/** Get events for a specific lead. */
export const listByLead = query({
    args: {
        leadId: v.id("leads"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        return await ctx.db
            .query("events")
            .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
            .order("desc")
            .take(limit);
    },
});
/** Recent activity across all leads (for dashboard). */
export const recentActivity = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 30;
        return await ctx.db.query("events").order("desc").take(limit);
    },
});
