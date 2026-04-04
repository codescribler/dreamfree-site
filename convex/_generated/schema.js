import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
    // ── CORE TABLES (active now) ──
    leads: defineTable({
        email: v.string(),
        firstName: v.optional(v.string()),
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        website: v.optional(v.string()),
        anonymousIds: v.array(v.string()),
        sources: v.array(v.string()),
        score: v.optional(v.number()),
        signalScore: v.optional(v.number()),
        signalUrl: v.optional(v.string()),
        signalCustomer: v.optional(v.string()),
        lastSeenAt: v.number(),
        createdAt: v.number(),
    })
        .index("by_email", ["email"])
        .index("by_createdAt", ["createdAt"])
        .index("by_lastSeenAt", ["lastSeenAt"]),
    events: defineTable({
        type: v.string(),
        anonymousId: v.string(),
        leadId: v.optional(v.id("leads")),
        sessionId: v.string(),
        path: v.string(),
        properties: v.any(),
        timestamp: v.number(),
    })
        .index("by_anonymousId", ["anonymousId"])
        .index("by_leadId", ["leadId"])
        .index("by_type_and_timestamp", ["type", "timestamp"])
        .index("by_anonymousId_and_type", ["anonymousId", "type"])
        .index("by_sessionId", ["sessionId"]),
    formSubmissions: defineTable({
        leadId: v.optional(v.id("leads")),
        anonymousId: v.optional(v.string()),
        type: v.union(v.literal("course_signup"), v.literal("email_capture"), v.literal("contact_form"), v.literal("signal_score")),
        data: v.any(),
        createdAt: v.number(),
    })
        .index("by_leadId", ["leadId"])
        .index("by_type", ["type"])
        .index("by_createdAt", ["createdAt"]),
    signalReports: defineTable({
        leadId: v.id("leads"),
        anonymousId: v.string(),
        url: v.string(),
        customerDescription: v.string(),
        overallScore: v.number(),
        gruntTest: v.object({
            pass: v.boolean(),
            explanation: v.string(),
        }),
        elements: v.object({
            character: v.object({
                score: v.number(),
                summary: v.string(),
                analysis: v.string(),
                businessImpact: v.string(),
                recommendations: v.array(v.string()),
            }),
            problem: v.object({
                score: v.number(),
                summary: v.string(),
                analysis: v.string(),
                businessImpact: v.string(),
                recommendations: v.array(v.string()),
            }),
            guide: v.object({
                score: v.number(),
                summary: v.string(),
                analysis: v.string(),
                businessImpact: v.string(),
                recommendations: v.array(v.string()),
            }),
            plan: v.object({
                score: v.number(),
                summary: v.string(),
                analysis: v.string(),
                businessImpact: v.string(),
                recommendations: v.array(v.string()),
            }),
            cta: v.object({
                score: v.number(),
                summary: v.string(),
                analysis: v.string(),
                businessImpact: v.string(),
                recommendations: v.array(v.string()),
            }),
            stakes: v.object({
                score: v.number(),
                summary: v.string(),
                analysis: v.string(),
                businessImpact: v.string(),
                recommendations: v.array(v.string()),
            }),
            transformation: v.object({
                score: v.number(),
                summary: v.string(),
                analysis: v.string(),
                businessImpact: v.string(),
                recommendations: v.array(v.string()),
            }),
        }),
        quickWin: v.string(),
        strengths: v.array(v.string()),
        fullSummary: v.string(),
        status: v.union(v.literal("success"), v.literal("fetch_failed"), v.literal("llm_failed"), v.literal("rate_limited")),
        accessLevel: v.union(v.literal("public"), v.literal("verified")),
        verifyCode: v.string(),
        verifyToken: v.string(),
        clerkUserId: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_leadId", ["leadId"])
        .index("by_anonymousId", ["anonymousId"])
        .index("by_url", ["url"])
        .index("by_createdAt", ["createdAt"])
        .index("by_status", ["status"]),
    callbackRequests: defineTable({
        leadId: v.id("leads"),
        reportId: v.id("signalReports"),
        phone: v.string(),
        status: v.union(v.literal("pending"), v.literal("contacted"), v.literal("closed")),
        createdAt: v.number(),
    })
        .index("by_status", ["status"])
        .index("by_createdAt", ["createdAt"]),
    // ── FUTURE TABLES (defined now, populated later) ──
    tags: defineTable({
        name: v.string(),
        color: v.optional(v.string()),
        createdAt: v.number(),
    }).index("by_name", ["name"]),
    leadTags: defineTable({
        leadId: v.id("leads"),
        tagId: v.id("tags"),
        appliedBy: v.union(v.literal("manual"), v.literal("auto")),
        createdAt: v.number(),
    })
        .index("by_leadId", ["leadId"])
        .index("by_tagId", ["tagId"]),
    emailSequences: defineTable({
        name: v.string(),
        description: v.optional(v.string()),
        trigger: v.string(),
        isActive: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index("by_trigger", ["trigger"]),
    emailSequenceSteps: defineTable({
        sequenceId: v.id("emailSequences"),
        order: v.number(),
        subject: v.string(),
        body: v.string(),
        delayMs: v.number(),
        createdAt: v.number(),
    }).index("by_sequenceId", ["sequenceId"]),
    emailEnrollments: defineTable({
        leadId: v.id("leads"),
        sequenceId: v.id("emailSequences"),
        currentStep: v.number(),
        status: v.union(v.literal("active"), v.literal("completed"), v.literal("cancelled")),
        enrolledAt: v.number(),
        lastStepAt: v.optional(v.number()),
        nextStepScheduledAt: v.optional(v.number()),
    })
        .index("by_leadId", ["leadId"])
        .index("by_sequenceId", ["sequenceId"])
        .index("by_status", ["status"]),
    emailSends: defineTable({
        enrollmentId: v.optional(v.id("emailEnrollments")),
        leadId: v.id("leads"),
        subject: v.string(),
        resendId: v.optional(v.string()),
        status: v.union(v.literal("sent"), v.literal("delivered"), v.literal("opened"), v.literal("clicked"), v.literal("bounced"), v.literal("failed")),
        openedAt: v.optional(v.number()),
        clickedAt: v.optional(v.number()),
        sentAt: v.number(),
    })
        .index("by_leadId", ["leadId"])
        .index("by_enrollmentId", ["enrollmentId"])
        .index("by_resendId", ["resendId"]),
});
