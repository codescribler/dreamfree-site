import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

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

/**
 * Record a demo request triggered from the Signal Score report page
 * ("Show me what my homepage could look like" CTA). The lead is already
 * known via the report; we only have website + idealCustomer from the
 * audit, so businessName / industry / mainGoal are left blank.
 */
export const submitFromReport = mutation({
  args: {
    reportId: v.id("signalReports"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; requestId: Id<"demoRequests"> }> => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");
    const lead = await ctx.db.get(report.leadId);
    if (!lead) throw new Error("Lead not found");

    const now = Date.now();

    const requestId = await ctx.db.insert("demoRequests", {
      leadId: lead._id,
      firstName: lead.firstName ?? lead.name ?? "Unknown",
      email: lead.email,
      phone: lead.phone,
      website: report.url,
      idealCustomer: report.customerDescription,
      additionalInfo: `Triggered from Signal Score report (score: ${report.overallScore}/100). Report id: ${args.reportId}.`,
      signalReportId: args.reportId,
      status: "requested",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("formSubmissions", {
      leadId: lead._id,
      type: "demo_request",
      data: {
        source: "report_page",
        firstName: lead.firstName ?? lead.name,
        email: lead.email,
        phone: lead.phone,
        website: report.url,
        idealCustomer: report.customerDescription,
        signalScore: report.overallScore,
        reportId: args.reportId,
        requestId,
      },
      createdAt: now,
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

/** All demo requests for a lead, newest first. Used by the lead detail page. */
export const listForLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("demoRequests")
      .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .take(50);
  },
});

/**
 * Board view for /dashboard/demos: five active columns plus a small
 * archive summary. Requests are pulled most-recently-updated-first within
 * each column so the freshest action sits at the top.
 *
 * Column → status mapping:
 *   Requested    → "requested"
 *   In Progress  → "in_progress"
 *   Ready        → "demo_complete"      (API has deployed; Daniel to review/send)
 *   Delivered    → "notification_sent"  (Daniel has sent the link to the customer)
 *   Viewed       → "customer_reviewed"  (customer has seen the demo)
 */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("demoRequests").collect();

    rows.sort((a, b) => b.updatedAt - a.updatedAt);

    const requested = rows.filter((r) => r.status === "requested");
    const inProgress = rows.filter((r) => r.status === "in_progress");
    const ready = rows.filter((r) => r.status === "demo_complete");
    const delivered = rows.filter((r) => r.status === "notification_sent");
    const viewed = rows.filter((r) => r.status === "customer_reviewed");

    const archive = {
      followedUp: rows.filter((r) => r.status === "followed_up").length,
      won: rows.filter((r) => r.status === "won").length,
      lost: rows.filter((r) => r.status === "lost").length,
    };

    return { requested, inProgress, ready, delivered, viewed, archive };
  },
});

/** Count of active demo requests for the nav badge (everything not won/lost). */
export const countActive = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("demoRequests").take(2000);
    return rows.filter((r) => r.status !== "won" && r.status !== "lost").length;
  },
});

/**
 * List demo requests for the public API. Optional filters narrow the result
 * server-side so the demo-builder doesn't have to download everything.
 *
 *   `status` — array of one-or-more status values to include.
 *   `since`  — only return rows updated on/after this epoch-ms timestamp.
 *   `limit`  — defaults to 100, max 500.
 */
export const listForApi = query({
  args: {
    status: v.optional(v.array(STATUS_VALIDATOR)),
    since: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 500);
    const sample = await ctx.db
      .query("demoRequests")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit * 3);

    const statusFilter = args.status ? new Set(args.status) : null;
    const since = args.since ?? null;

    const filtered = sample.filter((r) => {
      if (statusFilter && !statusFilter.has(r.status)) return false;
      if (since != null && r.updatedAt < since) return false;
      return true;
    });
    return filtered.slice(0, limit);
  },
});

/**
 * Single demo request with the linked lead and (if applicable) the
 * originating Signal Report. Used by GET /api/v1/demo-requests/{id}.
 *
 * Falls back to parsing `additionalInfo` for the signal report id when
 * the dedicated `signalReportId` column is unset (legacy rows that
 * predate that field).
 */
export const getApiDetail = query({
  args: { requestId: v.id("demoRequests") },
  handler: async (ctx, args) => {
    const demoRequest = await ctx.db.get(args.requestId);
    if (!demoRequest) return null;

    const lead = await ctx.db.get(demoRequest.leadId);

    let signalReport: Doc<"signalReports"> | null = null;
    let reportId: Id<"signalReports"> | null = demoRequest.signalReportId ?? null;
    if (!reportId && demoRequest.additionalInfo) {
      const match = demoRequest.additionalInfo.match(
        /Report id:\s*([a-z0-9]+)\.?/i,
      );
      if (match) {
        reportId = match[1] as Id<"signalReports">;
      }
    }
    if (reportId) {
      try {
        signalReport = await ctx.db.get(reportId);
      } catch {
        signalReport = null;
      }
    }

    return { demoRequest, lead, signalReport };
  },
});

/**
 * Mark a demo as deployed: stamp demoUrl + demoDeployedAt and, when the
 * current status is at or before "in_progress", advance it to "demo_complete"
 * (the "Ready" column on the board). Never downgrades a later state.
 */
export const markDeployed = mutation({
  args: {
    requestId: v.id("demoRequests"),
    demoUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const demoRequest = await ctx.db.get(args.requestId);
    if (!demoRequest) {
      throw new Error("demo request not found");
    }
    const now = Date.now();
    const upstreamStatuses = new Set<Doc<"demoRequests">["status"]>([
      "requested",
      "in_progress",
    ]);
    const nextStatus: Doc<"demoRequests">["status"] = upstreamStatuses.has(
      demoRequest.status,
    )
      ? "demo_complete"
      : demoRequest.status;

    await ctx.db.patch(args.requestId, {
      demoUrl: args.demoUrl,
      demoDeployedAt: now,
      status: nextStatus,
      updatedAt: now,
    });
    return { ok: true };
  },
});
