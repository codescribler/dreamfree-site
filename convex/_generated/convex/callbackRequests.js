import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
export const create = mutation({
    args: {
        leadId: v.id("leads"),
        reportId: v.id("signalReports"),
        phone: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("callbackRequests", {
            leadId: args.leadId,
            reportId: args.reportId,
            phone: args.phone,
            status: "pending",
            createdAt: Date.now(),
        });
    },
});
/** All callback requests for a lead, newest first. Used by the lead detail page. */
export const listForLead = query({
    args: { leadId: v.id("leads") },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("callbackRequests")
            .withIndex("by_createdAt")
            .order("desc")
            .take(200);
        return rows.filter((r) => r.leadId === args.leadId);
    },
});
