import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
export const submitCourseSignup = mutation({
    args: {
        email: v.string(),
        firstName: v.string(),
        anonymousId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const leadId = await ctx.runMutation(internal.leads.upsertLead, {
            email: args.email,
            firstName: args.firstName,
            source: "course_signup",
            anonymousId: args.anonymousId,
        });
        await ctx.db.insert("formSubmissions", {
            leadId,
            type: "course_signup",
            data: { email: args.email, firstName: args.firstName },
            createdAt: Date.now(),
        });
        if (args.anonymousId) {
            await ctx.runMutation(internal.leads.linkAnonymousEvents, {
                leadId,
                anonymousId: args.anonymousId,
            });
        }
        return { success: true };
    },
});
export const submitEmailCapture = mutation({
    args: {
        email: v.string(),
        anonymousId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const leadId = await ctx.runMutation(internal.leads.upsertLead, {
            email: args.email,
            source: "email_capture",
            anonymousId: args.anonymousId,
        });
        await ctx.db.insert("formSubmissions", {
            leadId,
            type: "email_capture",
            data: { email: args.email },
            createdAt: Date.now(),
        });
        if (args.anonymousId) {
            await ctx.runMutation(internal.leads.linkAnonymousEvents, {
                leadId,
                anonymousId: args.anonymousId,
            });
        }
        return { success: true };
    },
});
export const submitContactForm = mutation({
    args: {
        name: v.string(),
        email: v.string(),
        website: v.optional(v.string()),
        message: v.string(),
        anonymousId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const leadId = await ctx.runMutation(internal.leads.upsertLead, {
            email: args.email,
            name: args.name,
            website: args.website,
            source: "contact_form",
            anonymousId: args.anonymousId,
        });
        await ctx.db.insert("formSubmissions", {
            leadId,
            type: "contact_form",
            data: {
                name: args.name,
                email: args.email,
                website: args.website,
                message: args.message,
            },
            createdAt: Date.now(),
        });
        if (args.anonymousId) {
            await ctx.runMutation(internal.leads.linkAnonymousEvents, {
                leadId,
                anonymousId: args.anonymousId,
            });
        }
        // Send email notification to Daniel
        await ctx.scheduler.runAfter(0, internal.emails.sendContactNotification, {
            leadId,
            name: args.name,
            email: args.email,
            website: args.website,
            message: args.message,
        });
        return { success: true };
    },
});
/**
 * Signal Score now collects email, so we create/upsert a lead
 * and link the submission to it.
 */
export const submitSignalScore = mutation({
    args: {
        url: v.string(),
        customerDescription: v.string(),
        firstName: v.string(),
        email: v.string(),
        score: v.number(),
        reportId: v.optional(v.string()),
        anonymousId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const leadId = await ctx.runMutation(internal.leads.upsertLead, {
            email: args.email,
            firstName: args.firstName,
            website: args.url,
            source: "signal_score",
            anonymousId: args.anonymousId,
            signalScore: args.score,
            signalUrl: args.url,
            signalCustomer: args.customerDescription,
        });
        await ctx.db.insert("formSubmissions", {
            leadId,
            type: "signal_score",
            anonymousId: args.anonymousId,
            data: {
                url: args.url,
                customerDescription: args.customerDescription,
                firstName: args.firstName,
                email: args.email,
                score: args.score,
                reportId: args.reportId,
            },
            createdAt: Date.now(),
        });
        if (args.anonymousId) {
            await ctx.runMutation(internal.leads.linkAnonymousEvents, {
                leadId,
                anonymousId: args.anonymousId,
            });
        }
        return { success: true, leadId };
    },
});
/** List form submissions for dashboard. */
export const list = query({
    args: {
        type: v.optional(v.union(v.literal("course_signup"), v.literal("email_capture"), v.literal("contact_form"), v.literal("signal_score"))),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        if (args.type) {
            return await ctx.db
                .query("formSubmissions")
                .withIndex("by_type", (q) => q.eq("type", args.type))
                .order("desc")
                .take(limit);
        }
        return await ctx.db
            .query("formSubmissions")
            .withIndex("by_createdAt")
            .order("desc")
            .take(limit);
    },
});
