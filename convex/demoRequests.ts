import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const STATUS_VALIDATOR = v.union(
  v.literal("requested"),
  v.literal("in_progress"),
  v.literal("demo_complete"),
  v.literal("notification_sent"),
  v.literal("customer_reviewed"),
  v.literal("followed_up"),
  v.literal("won"),
  v.literal("lost"),
);

/** Submit a new demo request from the typeform-style flow. */
export const submit = mutation({
  args: {
    firstName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    businessName: v.string(),
    website: v.optional(v.string()),
    industry: v.string(),
    idealCustomer: v.string(),
    mainGoal: v.string(),
    likedSites: v.optional(v.string()),
    brandNotes: v.optional(v.string()),
    additionalInfo: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; requestId: Id<"demoRequests"> }> => {
    const now = Date.now();

    // Upsert lead
    const leadId: Id<"leads"> = await ctx.runMutation(internal.leads.upsertLead, {
      email: args.email,
      firstName: args.firstName,
      phone: args.phone,
      website: args.website,
      source: "demo_request",
      anonymousId: args.anonymousId,
    });

    // Insert demo request
    const requestId = await ctx.db.insert("demoRequests", {
      leadId,
      firstName: args.firstName,
      email: args.email.toLowerCase(),
      phone: args.phone,
      businessName: args.businessName,
      website: args.website,
      industry: args.industry,
      idealCustomer: args.idealCustomer,
      mainGoal: args.mainGoal,
      likedSites: args.likedSites,
      brandNotes: args.brandNotes,
      additionalInfo: args.additionalInfo,
      status: "requested",
      createdAt: now,
      updatedAt: now,
    });

    // Track as form submission
    await ctx.db.insert("formSubmissions", {
      leadId,
      anonymousId: args.anonymousId,
      type: "demo_request",
      data: {
        firstName: args.firstName,
        email: args.email,
        phone: args.phone,
        businessName: args.businessName,
        website: args.website,
        industry: args.industry,
        idealCustomer: args.idealCustomer,
        mainGoal: args.mainGoal,
        likedSites: args.likedSites,
        brandNotes: args.brandNotes,
        additionalInfo: args.additionalInfo,
        requestId,
      },
      createdAt: now,
    });

    // Link anonymous events
    if (args.anonymousId) {
      await ctx.runMutation(internal.leads.linkAnonymousEvents, {
        leadId,
        anonymousId: args.anonymousId,
      });
    }

    // Schedule emails
    await ctx.scheduler.runAfter(0, internal.emails.sendDemoRequestConfirmation, {
      firstName: args.firstName,
      email: args.email,
      businessName: args.businessName,
    });

    await ctx.scheduler.runAfter(0, internal.emails.sendDemoRequestNotification, {
      firstName: args.firstName,
      email: args.email,
      phone: args.phone,
      businessName: args.businessName,
      website: args.website,
      industry: args.industry,
      idealCustomer: args.idealCustomer,
      mainGoal: args.mainGoal,
      likedSites: args.likedSites,
      brandNotes: args.brandNotes,
      additionalInfo: args.additionalInfo,
      requestId: requestId as string,
    });

    return { success: true, requestId };
  },
});

/** Update the status of a demo request. */
export const updateStatus = mutation({
  args: {
    requestId: v.id("demoRequests"),
    status: STATUS_VALIDATOR,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/** List demo requests, optionally filtered by status. */
export const list = query({
  args: {
    status: v.optional(STATUS_VALIDATOR),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    if (args.status) {
      return await ctx.db
        .query("demoRequests")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("demoRequests")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});

/** Get a single demo request by ID. */
export const getById = query({
  args: { requestId: v.id("demoRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.requestId);
  },
});
