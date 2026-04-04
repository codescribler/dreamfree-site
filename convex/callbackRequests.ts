import { v } from "convex/values";
import { mutation } from "./_generated/server";

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
