import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

/** Find a lead by email (reusable helper). */
async function getLeadByEmail(
  ctx: QueryCtx | MutationCtx,
  email: string,
): Promise<Doc<"leads"> | null> {
  return await ctx.db
    .query("leads")
    .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
    .first();
}

/**
 * Upsert a lead: find by email or create new.
 * Returns the lead ID. Called internally by form submission mutations.
 */
export const upsertLead = internalMutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    source: v.string(),
    anonymousId: v.optional(v.string()),
    signalScore: v.optional(v.number()),
    signalUrl: v.optional(v.string()),
    signalCustomer: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"leads">> => {
    const now = Date.now();
    const email = args.email.toLowerCase();
    const existing = await getLeadByEmail(ctx, email);

    if (existing) {
      const updates: Partial<Doc<"leads">> = { lastSeenAt: now };

      if (args.firstName && !existing.firstName) {
        updates.firstName = args.firstName;
      }
      if (args.name && !existing.name) {
        updates.name = args.name;
      }
      if (args.phone && !existing.phone) {
        updates.phone = args.phone;
      }
      if (args.website && !existing.website) {
        updates.website = args.website;
      }
      if (args.signalScore !== undefined) {
        updates.signalScore = args.signalScore;
        updates.signalUrl = args.signalUrl;
        updates.signalCustomer = args.signalCustomer;
      }
      if (!existing.sources.includes(args.source)) {
        updates.sources = [...existing.sources, args.source];
      }
      if (args.anonymousId && !existing.anonymousIds.includes(args.anonymousId)) {
        updates.anonymousIds = [...existing.anonymousIds, args.anonymousId];
      }

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("leads", {
      email,
      firstName: args.firstName,
      name: args.name,
      phone: args.phone,
      website: args.website,
      anonymousIds: args.anonymousId ? [args.anonymousId] : [],
      sources: [args.source],
      signalScore: args.signalScore,
      signalUrl: args.signalUrl,
      signalCustomer: args.signalCustomer,
      lastSeenAt: now,
      createdAt: now,
    });
  },
});

/**
 * Link all anonymous events to a lead.
 * Called after a form submission identifies a visitor.
 */
export const linkAnonymousEvents = internalMutation({
  args: {
    leadId: v.id("leads"),
    anonymousId: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_anonymousId", (q) => q.eq("anonymousId", args.anonymousId))
      .collect();

    for (const event of events) {
      if (!event.leadId) {
        await ctx.db.patch(event._id, { leadId: args.leadId });
      }
    }
  },
});

/** List all leads, newest first. */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("leads")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});

/** Get a single lead by ID. */
export const getById = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.leadId);
  },
});

/**
 * Public wrapper for upsertLead — used by the Next.js API route
 * via ConvexHttpClient (which can't call internal mutations).
 */
export const upsertLeadPublic = mutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    source: v.string(),
    anonymousId: v.optional(v.string()),
    signalScore: v.optional(v.number()),
    signalUrl: v.optional(v.string()),
    signalCustomer: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"leads">> => {
    return await ctx.runMutation(internal.leads.upsertLead, args);
  },
});
