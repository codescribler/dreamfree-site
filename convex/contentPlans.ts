import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/** Save a completed content plan. Called from the API route. */
export const savePlan = mutation({
  args: {
    leadId: v.id("leads"),
    anonymousId: v.optional(v.string()),
    input: v.object({
      name: v.string(),
      email: v.string(),
      businessDescription: v.string(),
      goal: v.string(),
      channelsTried: v.array(v.string()),
      frustration: v.string(),
      timePerWeek: v.string(),
      website: v.optional(v.string()),
    }),
    summary: v.string(),
    ideas: v.array(
      v.object({
        title: v.string(),
        format: v.string(),
        keyword: v.string(),
        why: v.string(),
        brief: v.string(),
        timeEstimate: v.string(),
        priority: v.number(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<Id<"contentPlans">> => {
    const planId = await ctx.db.insert("contentPlans", {
      leadId: args.leadId,
      anonymousId: args.anonymousId,
      input: args.input,
      summary: args.summary,
      ideas: args.ideas,
      status: "success",
      createdAt: Date.now(),
    });

    const emailArgs = {
      name: args.input.name,
      email: args.input.email,
      businessDescription: args.input.businessDescription,
      goal: args.input.goal,
      channelsTried: args.input.channelsTried,
      frustration: args.input.frustration,
      timePerWeek: args.input.timePerWeek,
      website: args.input.website,
      planId: planId as string,
      ideaTitles: args.ideas.map((i) => i.title),
    };

    // Send notification to Daniel + plan link to the visitor
    await ctx.scheduler.runAfter(0, internal.emails.sendContentPlanNotification, emailArgs);
    await ctx.scheduler.runAfter(0, internal.emails.sendContentPlanToVisitor, {
      name: args.input.name,
      email: args.input.email,
      planId: planId as string,
      ideaTitles: args.ideas.map((i) => i.title),
      summary: args.summary,
    });

    return planId;
  },
});

/** Count how many successful plans exist for an anonymousId or email. */
export const countUses = query({
  args: {
    anonymousId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Count by anonymousId
    const byAnon = await ctx.db
      .query("contentPlans")
      .withIndex("by_createdAt")
      .collect();
    const anonCount = byAnon.filter(
      (p) => p.anonymousId === args.anonymousId && p.status === "success",
    ).length;

    // Count by email via lead lookup
    let emailCount = 0;
    if (args.email) {
      const lead = await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", args.email!.toLowerCase()))
        .first();
      if (lead) {
        const byLead = await ctx.db
          .query("contentPlans")
          .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
          .collect();
        emailCount = byLead.filter((p) => p.status === "success").length;
      }
    }

    return Math.max(anonCount, emailCount);
  },
});

/** Get a content plan by ID, with lead info. */
export const getById = query({
  args: { planId: v.id("contentPlans") },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) return null;

    const lead = await ctx.db.get(plan.leadId);

    return { plan, lead };
  },
});
