import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

const elementValidator = v.object({
  score: v.number(),
  summary: v.string(),
  analysis: v.string(),
  businessImpact: v.string(),
  recommendations: v.array(v.string()),
});

const elementsValidator = v.object({
  character: elementValidator,
  problem: elementValidator,
  guide: elementValidator,
  plan: elementValidator,
  cta: elementValidator,
  stakes: elementValidator,
  transformation: elementValidator,
});

/** Count successful reports by anonymousId OR email (via leadId). */
export const countUses = query({
  args: {
    anonymousId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Count by anonymousId
    const byAnon = await ctx.db
      .query("signalReports")
      .withIndex("by_anonymousId", (q) =>
        q.eq("anonymousId", args.anonymousId),
      )
      .collect();
    const anonCount = byAnon.filter((r) => r.status === "success").length;

    // Count by email if provided (look up lead first)
    let emailCount = 0;
    if (args.email) {
      const lead = await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", args.email!.toLowerCase()))
        .first();
      if (lead) {
        const byLead = await ctx.db
          .query("signalReports")
          .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
          .collect();
        emailCount = byLead.filter((r) => r.status === "success").length;
      }
    }

    return Math.max(anonCount, emailCount);
  },
});

const EMPTY_ELEMENT = {
  score: 0,
  summary: "",
  analysis: "",
  businessImpact: "",
  recommendations: [] as string[],
};

const EMPTY_ELEMENTS = {
  character: EMPTY_ELEMENT,
  problem: EMPTY_ELEMENT,
  guide: EMPTY_ELEMENT,
  plan: EMPTY_ELEMENT,
  cta: EMPTY_ELEMENT,
  stakes: EMPTY_ELEMENT,
  transformation: EMPTY_ELEMENT,
};

/** Save a complete signal report. */
export const saveReport = mutation({
  args: {
    leadId: v.id("leads"),
    anonymousId: v.string(),
    url: v.string(),
    customerDescription: v.string(),
    overallScore: v.number(),
    gruntTest: v.object({
      pass: v.boolean(),
      explanation: v.string(),
    }),
    elements: elementsValidator,
    quickWin: v.string(),
    strengths: v.array(v.string()),
    fullSummary: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("fetch_failed"),
      v.literal("llm_failed"),
      v.literal("rate_limited"),
    ),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("signalReports", {
      ...args,
      accessLevel: "public",
      createdAt: Date.now(),
    });
  },
});

/**
 * Create a pending report and schedule the LLM action.
 * Returns the new reportId immediately so the API route can redirect.
 */
export const enqueueReport = mutation({
  args: {
    leadId: v.id("leads"),
    anonymousId: v.string(),
    url: v.string(),
    customerDescription: v.string(),
    strippedContent: v.string(),
    firstName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (ctx, args) => {
    const reportId = await ctx.db.insert("signalReports", {
      leadId: args.leadId,
      anonymousId: args.anonymousId,
      url: args.url,
      customerDescription: args.customerDescription,
      overallScore: 0,
      gruntTest: { pass: false, explanation: "" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: "pending",
      accessLevel: "public",
      verifyCode: args.verifyCode,
      verifyToken: args.verifyToken,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.signalReportsAction.runReportGeneration,
      {
        reportId,
        strippedContent: args.strippedContent,
        customerDescription: args.customerDescription,
        firstName: args.firstName,
        email: args.email,
        phone: args.phone,
        url: args.url,
        anonymousId: args.anonymousId,
        verifyCode: args.verifyCode,
        verifyToken: args.verifyToken,
      },
    );

    return reportId;
  },
});

/** Patch a pending report with the full LLM result. */
export const completeReport = internalMutation({
  args: {
    reportId: v.id("signalReports"),
    overallScore: v.number(),
    gruntTest: v.object({
      pass: v.boolean(),
      explanation: v.string(),
    }),
    elements: elementsValidator,
    quickWin: v.string(),
    strengths: v.array(v.string()),
    fullSummary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      status: "success",
      overallScore: args.overallScore,
      gruntTest: args.gruntTest,
      elements: args.elements,
      quickWin: args.quickWin,
      strengths: args.strengths,
      fullSummary: args.fullSummary,
    });
  },
});

/** Patch a pending report to a failure status. Schedules an admin
 *  notification — every llm-side failure path ends here so this is the single
 *  source of truth for those notifications. */
export const failReport = internalMutation({
  args: {
    reportId: v.id("signalReports"),
    status: v.union(v.literal("fetch_failed"), v.literal("llm_failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, { status: args.status });

    const report = await ctx.db.get(args.reportId);
    if (!report) return;
    const lead = await ctx.db.get(report.leadId);
    if (!lead) return;
    await ctx.scheduler.runAfter(
      0,
      internal.emails.sendReportFailureNotification,
      {
        reportId: args.reportId,
        leadId: report.leadId,
        url: report.url,
        customerDescription: report.customerDescription,
        status: args.status,
        leadEmail: lead.email,
        leadFirstName: lead.firstName,
        error: args.error,
      },
    );
  },
});

/** Internal lookup used by the action (avoids exposing more public surface). */
export const getByIdInternal = internalQuery({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reportId);
  },
});

/**
 * Admin: delete every rate_limited report for a lead. Used when re-running a
 * report on their behalf to bring their `countUses` back below the cap.
 * Returns the number of rows removed.
 */
export const clearRateLimitedForLead = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("signalReports")
      .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
      .collect();

    let removed = 0;
    for (const row of rows) {
      if (row.status === "rate_limited") {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
    return removed;
  },
});

/** Save a failed or rate-limited report (minimal data). Schedules an admin
 *  notification for real failures (fetch_failed / llm_failed) — rate-limited
 *  is expected behaviour and intentionally does NOT notify. */
export const saveFailedReport = mutation({
  args: {
    leadId: v.id("leads"),
    anonymousId: v.string(),
    url: v.string(),
    customerDescription: v.string(),
    status: v.union(
      v.literal("fetch_failed"),
      v.literal("llm_failed"),
      v.literal("rate_limited"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reportId = await ctx.db.insert("signalReports", {
      leadId: args.leadId,
      anonymousId: args.anonymousId,
      url: args.url,
      customerDescription: args.customerDescription,
      overallScore: 0,
      gruntTest: { pass: false, explanation: "" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: args.status,
      accessLevel: "public",
      verifyCode: "",
      verifyToken: "",
      createdAt: Date.now(),
    });

    // Notify Daniel for real failures only — rate-limited is expected.
    if (args.status === "fetch_failed" || args.status === "llm_failed") {
      const lead = await ctx.db.get(args.leadId);
      if (lead) {
        await ctx.scheduler.runAfter(
          0,
          internal.emails.sendReportFailureNotification,
          {
            reportId,
            leadId: args.leadId,
            url: args.url,
            customerDescription: args.customerDescription,
            status: args.status,
            leadEmail: lead.email,
            leadFirstName: lead.firstName,
            error: args.error,
          },
        );
      }
    }

    return reportId;
  },
});

/** Get a single report by ID. */
export const getById = query({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reportId);
  },
});

/** Mark a report as verified (email code confirmed). */
export const markVerified = mutation({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (report && report.accessLevel === "public") {
      await ctx.db.patch(args.reportId, { accessLevel: "verified" });
    }
  },
});

/** Update verification credentials (for email correction / resend). */
export const updateVerifyCredentials = mutation({
  args: {
    reportId: v.id("signalReports"),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (report && report.accessLevel === "public") {
      await ctx.db.patch(args.reportId, {
        verifyCode: args.verifyCode,
        verifyToken: args.verifyToken,
      });
    }
  },
});

/** Link a user ID to a report after account creation. */
export const linkUser = mutation({
  args: {
    reportId: v.id("signalReports"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, { userId: args.userId });
  },
});

/** Get a report with its associated lead (for the report page). */
export const getByIdWithLead = query({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    const lead = await ctx.db.get(report.leadId);
    return { report, lead };
  },
});

/** List reports for a specific lead. */
export const listByLead = query({
  args: {
    leadId: v.id("leads"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("signalReports")
      .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .take(limit);
  },
});

/** List reports for dashboard. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("signalReports")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});

/** Count reports by status (for success/failure dashboard metrics). */
export const countByStatus = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("signalReports")
      .withIndex("by_createdAt")
      .order("desc")
      .take(500);
    const counts: Record<string, number> = {
      success: 0,
      fetch_failed: 0,
      llm_failed: 0,
      rate_limited: 0,
    };
    for (const r of all) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  },
});

export const addShareToken = mutation({
  args: {
    reportId: v.id("signalReports"),
    email: v.string(),
    token: v.string(),
    sharedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    const existing = report.shareTokens ?? [];
    await ctx.db.patch(args.reportId, {
      shareTokens: [
        ...existing,
        {
          email: args.email,
          token: args.token,
          sharedBy: args.sharedBy,
          createdAt: Date.now(),
        },
      ],
    });
  },
});

const SECTION_KEYS = [
  "character",
  "problem",
  "guide",
  "plan",
  "cta",
  "stakes",
  "transformation",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

/** All-time averages for each SB7 section across successful reports. */
export const averagesBySection = query({
  args: {},
  handler: async (ctx) => {
    const successful = await ctx.db
      .query("signalReports")
      .withIndex("by_status", (q) => q.eq("status", "success"))
      .collect();

    const totals: Record<SectionKey, { sum: number; count: number }> = {
      character: { sum: 0, count: 0 },
      problem: { sum: 0, count: 0 },
      guide: { sum: 0, count: 0 },
      plan: { sum: 0, count: 0 },
      cta: { sum: 0, count: 0 },
      stakes: { sum: 0, count: 0 },
      transformation: { sum: 0, count: 0 },
    };

    for (const report of successful) {
      for (const key of SECTION_KEYS) {
        const score = report.elements[key]?.score;
        if (typeof score === "number") {
          totals[key].sum += score;
          totals[key].count += 1;
        }
      }
    }

    const sections = {} as Record<
      SectionKey,
      { average: number; count: number }
    >;
    for (const key of SECTION_KEYS) {
      const { sum, count } = totals[key];
      sections[key] = {
        average: count === 0 ? 0 : sum / count,
        count,
      };
    }

    return {
      counts: { successful: successful.length },
      sections,
    };
  },
});

/**
 * Create a pending API-sourced report and schedule the LLM action.
 * Same flow as enqueueReport but:
 *  - accessLevel starts at "verified" (no email gate for API-created reports)
 *  - createdViaApiKeyId is recorded for admin attribution
 *  - anonymousId is empty (the prospect did not visit the site to trigger this)
 */
export const enqueueReportFromApi = mutation({
  args: {
    leadId: v.id("leads"),
    apiKeyId: v.id("apiKeys"),
    url: v.string(),
    customerDescription: v.string(),
    strippedContent: v.string(),
    firstName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (ctx, args) => {
    const reportId = await ctx.db.insert("signalReports", {
      leadId: args.leadId,
      anonymousId: "",
      url: args.url,
      customerDescription: args.customerDescription,
      overallScore: 0,
      gruntTest: { pass: false, explanation: "" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: "pending",
      accessLevel: "verified",
      verifyCode: args.verifyCode,
      verifyToken: args.verifyToken,
      createdAt: Date.now(),
      createdViaApiKeyId: args.apiKeyId,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.signalReportsAction.runReportGeneration,
      {
        reportId,
        strippedContent: args.strippedContent,
        customerDescription: args.customerDescription,
        firstName: args.firstName,
        email: args.email,
        phone: args.phone,
        url: args.url,
        anonymousId: "",
        verifyCode: args.verifyCode,
        verifyToken: args.verifyToken,
      },
    );

    return reportId;
  },
});

/** Save a failed report on the API path (no anonymousId). */
export const saveFailedApiReport = mutation({
  args: {
    leadId: v.id("leads"),
    apiKeyId: v.id("apiKeys"),
    url: v.string(),
    customerDescription: v.string(),
    status: v.union(
      v.literal("fetch_failed"),
      v.literal("llm_failed"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("signalReports", {
      leadId: args.leadId,
      anonymousId: "",
      url: args.url,
      customerDescription: args.customerDescription,
      overallScore: 0,
      gruntTest: { pass: false, explanation: "" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: args.status,
      accessLevel: "verified",
      verifyCode: "",
      verifyToken: "",
      createdAt: Date.now(),
      createdViaApiKeyId: args.apiKeyId,
    });
  },
});

/**
 * Returns the JSON shape served by GET /api/v1/signal-reports/{id}.
 * `report` is populated only on success.
 */
export const getApiResponse = query({
  args: {
    reportId: v.id("signalReports"),
    siteUrl: v.string(), // host part of viewUrl, e.g. "https://dreamfree.co.uk"
  },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reportId);
    if (!r) return null;

    const viewUrl = `${args.siteUrl}/report/${r._id}?token=${encodeURIComponent(r.verifyToken)}`;

    if (r.status !== "success") {
      return {
        reportId: r._id,
        status: r.status,
        viewUrl,
      };
    }

    return {
      reportId: r._id,
      status: r.status,
      viewUrl,
      report: {
        url: r.url,
        customerDescription: r.customerDescription,
        overallScore: r.overallScore,
        gruntTest: r.gruntTest,
        elements: r.elements,
        quickWin: r.quickWin,
        strengths: r.strengths,
        fullSummary: r.fullSummary,
      },
    };
  },
});

/**
 * Record a click-through on an API-created report.
 *
 * Stamps firstViewedAt (once) and increments viewCount on the report,
 * mirrors firstEngagedAt/lastEngagedAt/engagementCount onto the lead,
 * and emits an `outbound_report_viewed` event so Mission Control and
 * the admin dashboard surface the engagement.
 *
 * No-op for reports that were not created via the API (no
 * createdViaApiKeyId) and for missing reports — callers fire this
 * inside a redirect hook where exceptions would break navigation, so
 * silent failure is the right shape.
 */
export const recordEngagement = mutation({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    if (!report.createdViaApiKeyId) return null;

    const now = Date.now();
    const nextViewCount = (report.viewCount ?? 0) + 1;

    await ctx.db.patch(report._id, {
      firstViewedAt: report.firstViewedAt ?? now,
      viewCount: nextViewCount,
    });

    const lead = await ctx.db.get(report.leadId);
    if (lead) {
      await ctx.db.patch(lead._id, {
        firstEngagedAt: lead.firstEngagedAt ?? now,
        lastEngagedAt: now,
        engagementCount: (lead.engagementCount ?? 0) + 1,
      });
    }

    await ctx.db.insert("events", {
      type: "outbound_report_viewed",
      anonymousId: "",
      leadId: report.leadId,
      sessionId: "",
      path: `/report/${report._id}`,
      properties: { reportId: report._id, viewCount: nextViewCount },
      timestamp: now,
    });

    return null;
  },
});
