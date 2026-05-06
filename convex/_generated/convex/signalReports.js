import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, } from "./_generated/server";
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
            .withIndex("by_anonymousId", (q) => q.eq("anonymousId", args.anonymousId))
            .collect();
        const anonCount = byAnon.filter((r) => r.status === "success").length;
        // Count by email if provided (look up lead first)
        let emailCount = 0;
        if (args.email) {
            const lead = await ctx.db
                .query("leads")
                .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
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
    recommendations: [],
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
        status: v.union(v.literal("success"), v.literal("fetch_failed"), v.literal("llm_failed"), v.literal("rate_limited")),
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
        await ctx.scheduler.runAfter(0, internal.signalReportsAction.runReportGeneration, {
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
        });
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
/** Patch a pending report to a failure status. */
export const failReport = internalMutation({
    args: {
        reportId: v.id("signalReports"),
        status: v.union(v.literal("fetch_failed"), v.literal("llm_failed")),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.reportId, { status: args.status });
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
/** Save a failed or rate-limited report (minimal data). */
export const saveFailedReport = mutation({
    args: {
        leadId: v.id("leads"),
        anonymousId: v.string(),
        url: v.string(),
        customerDescription: v.string(),
        status: v.union(v.literal("fetch_failed"), v.literal("llm_failed"), v.literal("rate_limited")),
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
        if (!report)
            return null;
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
        const counts = {
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
        if (!report)
            throw new Error("Report not found");
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
];
/** All-time averages for each SB7 section across successful reports. */
export const averagesBySection = query({
    args: {},
    handler: async (ctx) => {
        const successful = await ctx.db
            .query("signalReports")
            .withIndex("by_status", (q) => q.eq("status", "success"))
            .collect();
        const totals = {
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
        const sections = {};
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
