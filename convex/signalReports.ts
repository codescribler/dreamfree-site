import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

/** Save a failed or rate-limited report (minimal data). */
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("signalReports", {
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

/** Link a Clerk user ID to a report after account creation. */
export const linkClerkUser = mutation({
  args: {
    reportId: v.id("signalReports"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, { clerkUserId: args.clerkUserId });
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
