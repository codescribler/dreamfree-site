import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
    // ── CORE TABLES (active now) ──
    users: defineTable({
        email: v.string(),
        passwordHash: v.string(),
        isAdmin: v.boolean(),
        createdAt: v.number(),
    }).index("by_email", ["email"]),
    loginTokens: defineTable({
        email: v.string(),
        tokenHash: v.string(),
        expiresAt: v.number(),
        usedAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_tokenHash", ["tokenHash"])
        .index("by_email", ["email"]),
    apiKeys: defineTable({
        name: v.string(),
        keyHash: v.string(),
        lastCalledAt: v.optional(v.number()),
        revokedAt: v.optional(v.number()),
        createdAt: v.number(),
    }).index("by_keyHash", ["keyHash"]),
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
        leadType: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
        consentedAt: v.optional(v.number()),
        // Engagement tracking — mirrors firstViewedAt/viewCount aggregated
        // across the lead's reports. Updated by signalReports.recordEngagement.
        firstEngagedAt: v.optional(v.number()),
        lastEngagedAt: v.optional(v.number()),
        engagementCount: v.optional(v.number()),
    })
        .index("by_email", ["email"])
        .index("by_createdAt", ["createdAt"])
        .index("by_lastSeenAt", ["lastSeenAt"])
        .index("by_leadType", ["leadType"]),
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
        type: v.union(v.literal("course_signup"), v.literal("email_capture"), v.literal("contact_form"), v.literal("signal_score"), v.literal("content_idea_generator"), v.literal("demo_request")),
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
        status: v.union(v.literal("pending"), v.literal("success"), v.literal("fetch_failed"), v.literal("llm_failed"), v.literal("rate_limited")),
        accessLevel: v.union(v.literal("public"), v.literal("verified")),
        verifyCode: v.string(),
        verifyToken: v.string(),
        userId: v.optional(v.string()),
        shareTokens: v.optional(v.array(v.object({
            email: v.string(),
            token: v.string(),
            sharedBy: v.string(),
            createdAt: v.number(),
        }))),
        createdAt: v.number(),
        createdViaApiKeyId: v.optional(v.id("apiKeys")),
        // Engagement tracking — set when a recipient clicks through to view
        // an API-generated report. See Plan 2 of the May 12 signal-report-api spec.
        firstViewedAt: v.optional(v.number()),
        viewCount: v.optional(v.number()),
    })
        .index("by_leadId", ["leadId"])
        .index("by_anonymousId", ["anonymousId"])
        .index("by_url", ["url"])
        .index("by_createdAt", ["createdAt"])
        .index("by_status", ["status"])
        .index("by_createdViaApiKeyId", ["createdViaApiKeyId"]),
    signalInsights: defineTable({
        section: v.union(v.literal("character"), v.literal("problem"), v.literal("guide"), v.literal("plan"), v.literal("cta"), v.literal("stakes"), v.literal("transformation")),
        status: v.optional(v.union(v.literal("pending"), v.literal("complete"), v.literal("failed"))),
        reportCount: v.number(),
        reportsAnalysed: v.array(v.id("signalReports")),
        summary: v.string(),
        contentIdeas: v.array(v.object({
            hook: v.string(),
            angle: v.string(),
            format: v.optional(v.string()),
        })),
        modelUsed: v.string(),
        errorMessage: v.optional(v.string()),
        createdAt: v.number(),
        completedAt: v.optional(v.number()),
    }).index("by_section_and_createdAt", ["section", "createdAt"]),
    contentPlans: defineTable({
        leadId: v.id("leads"),
        anonymousId: v.optional(v.string()),
        // Inputs from the form
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
        // Structured output from the LLM
        summary: v.string(),
        ideas: v.array(v.object({
            title: v.string(),
            format: v.string(),
            keyword: v.string(),
            why: v.string(),
            brief: v.string(),
            timeEstimate: v.string(),
            priority: v.number(),
        })),
        status: v.union(v.literal("success"), v.literal("failed")),
        createdAt: v.number(),
    })
        .index("by_leadId", ["leadId"])
        .index("by_createdAt", ["createdAt"]),
    callbackRequests: defineTable({
        leadId: v.id("leads"),
        reportId: v.id("signalReports"),
        phone: v.string(),
        status: v.union(v.literal("pending"), v.literal("contacted"), v.literal("closed")),
        createdAt: v.number(),
    })
        .index("by_status", ["status"])
        .index("by_createdAt", ["createdAt"]),
    demoRequests: defineTable({
        leadId: v.id("leads"),
        firstName: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
        businessName: v.optional(v.string()),
        website: v.optional(v.string()),
        industry: v.optional(v.string()),
        idealCustomer: v.string(),
        mainGoal: v.optional(v.string()),
        likedSites: v.optional(v.string()),
        brandNotes: v.optional(v.string()),
        additionalInfo: v.optional(v.string()),
        status: v.union(v.literal("requested"), v.literal("in_progress"), v.literal("demo_complete"), v.literal("notification_sent"), v.literal("customer_reviewed"), v.literal("followed_up"), v.literal("won"), v.literal("lost")),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_status", ["status"])
        .index("by_leadId", ["leadId"])
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
    // ── EMAIL CAMPAIGNS ──
    campaignConfig: defineTable({
        globalKillSwitch: v.boolean(),
        killSwitchNote: v.optional(v.string()),
        killSwitchUpdatedAt: v.number(),
        fromAddress: v.string(),
        defaultLlmModel: v.string(),
        businessHoursEnabled: v.boolean(),
        businessHoursStartUtcMinutes: v.number(),
        businessHoursEndUtcMinutes: v.number(),
        businessDays: v.array(v.number()),
        unsubscribeBaseUrl: v.string(),
    }),
    emailVoiceSpec: defineTable({
        body: v.string(),
        version: v.number(),
        isCurrent: v.boolean(),
        createdAt: v.number(),
        createdBy: v.string(),
    })
        .index("by_isCurrent", ["isCurrent"])
        .index("by_version", ["version"]),
    emailSequences: defineTable({
        name: v.string(),
        description: v.optional(v.string()),
        trigger: v.string(),
        isActive: v.boolean(),
        roleGaps: v.array(v.number()),
        orientationRespectsBusinessHours: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index("by_trigger", ["trigger"]),
    emailRoleBriefs: defineTable({
        sequenceId: v.id("emailSequences"),
        role: v.union(v.literal("orientation"), v.literal("backstory"), v.literal("wall"), v.literal("epiphany"), v.literal("application"), v.literal("hidden_benefits"), v.literal("offer")),
        order: v.number(),
        purpose: v.string(),
        requiredBeats: v.string(),
        loopsToOpen: v.string(),
        loopsToClose: v.string(),
        tone: v.string(),
        lengthGuide: v.string(),
        workedExample: v.string(),
        version: v.number(),
        isCurrent: v.boolean(),
        createdAt: v.number(),
        createdBy: v.string(),
    })
        .index("by_sequence_role_isCurrent", ["sequenceId", "role", "isCurrent"])
        .index("by_sequence_role_version", ["sequenceId", "role", "version"]),
    emailEnrollments: defineTable({
        leadId: v.id("leads"),
        sequenceId: v.id("emailSequences"),
        reportId: v.id("signalReports"),
        status: v.union(v.literal("generating"), v.literal("generation_failed"), v.literal("pending_approval"), v.literal("approved"), v.literal("paused"), v.literal("stopped"), v.literal("completed"), v.literal("unsubscribed")),
        pausedReason: v.optional(v.union(v.literal("replied"), v.literal("manual"), v.literal("stale_cascade"))),
        voiceVersionUsed: v.number(),
        loopLedger: v.array(v.object({
            id: v.string(),
            openedInRole: v.string(),
            closedInRole: v.optional(v.string()),
            description: v.string(),
        })),
        verificationFlags: v.optional(v.object({
            voice: v.array(v.object({ role: v.string(), note: v.string() })),
            loops: v.array(v.object({ role: v.string(), note: v.string() })),
            cheese: v.array(v.object({ role: v.string(), note: v.string() })),
            factual: v.array(v.object({ role: v.string(), note: v.string() })),
        })),
        generationError: v.optional(v.string()),
        enrolledAt: v.number(),
        approvedAt: v.optional(v.number()),
        pausedAt: v.optional(v.number()),
        stoppedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
    })
        .index("by_leadId", ["leadId"])
        .index("by_sequenceId", ["sequenceId"])
        .index("by_status", ["status"])
        .index("by_reportId", ["reportId"]),
    emailDrafts: defineTable({
        enrollmentId: v.id("emailEnrollments"),
        role: v.union(v.literal("orientation"), v.literal("backstory"), v.literal("wall"), v.literal("epiphany"), v.literal("application"), v.literal("hidden_benefits"), v.literal("offer")),
        order: v.number(),
        subject: v.string(),
        bodyHtml: v.string(),
        bodyText: v.string(),
        scheduledFor: v.optional(v.number()),
        scheduledFunctionId: v.optional(v.string()),
        sentAt: v.optional(v.number()),
        status: v.union(v.literal("draft"), v.literal("scheduled"), v.literal("sent"), v.literal("failed"), v.literal("skipped_terminal"), v.literal("skipped_suppressed")),
        briefVersionUsed: v.number(),
        voiceVersionUsed: v.number(),
        loopsOpenedHere: v.array(v.string()),
        loopsClosedHere: v.array(v.string()),
        reportFindingsUsed: v.array(v.string()),
        isStale: v.boolean(),
        editedByDaniel: v.boolean(),
        unsubscribeToken: v.string(),
    })
        .index("by_enrollment", ["enrollmentId"])
        .index("by_status", ["status"])
        .index("by_unsubscribeToken", ["unsubscribeToken"]),
    emailSends: defineTable({
        enrollmentId: v.id("emailEnrollments"),
        draftId: v.id("emailDrafts"),
        leadId: v.id("leads"),
        subject: v.string(),
        resendId: v.optional(v.string()),
        status: v.union(v.literal("sent"), v.literal("delivered"), v.literal("opened"), v.literal("clicked"), v.literal("bounced"), v.literal("complained"), v.literal("failed")),
        openedAt: v.optional(v.number()),
        clickedAt: v.optional(v.number()),
        clickedUrl: v.optional(v.string()),
        bouncedAt: v.optional(v.number()),
        unsubscribedAt: v.optional(v.number()),
        sentAt: v.number(),
    })
        .index("by_leadId", ["leadId"])
        .index("by_enrollmentId", ["enrollmentId"])
        .index("by_draftId", ["draftId"])
        .index("by_resendId", ["resendId"]),
    emailSuppressions: defineTable({
        email: v.string(),
        reason: v.union(v.literal("unsubscribed"), v.literal("bounced"), v.literal("complained"), v.literal("manual")),
        suppressedAt: v.number(),
        enrollmentId: v.optional(v.id("emailEnrollments")),
        note: v.optional(v.string()),
    }).index("by_email", ["email"]),
    // ── ADMIN AI MODELS ──
    aiModelConfig: defineTable({
        useCase: v.string(),
        primary: v.string(),
        fallback: v.string(),
        updatedAt: v.number(),
        updatedBy: v.optional(v.string()),
    }).index("by_useCase", ["useCase"]),
    aiModelPricing: defineTable({
        model: v.string(),
        promptUsdPerMillion: v.number(),
        completionUsdPerMillion: v.number(),
        fetchedAt: v.number(),
    }).index("by_model", ["model"]),
    aiModelReplays: defineTable({
        useCase: v.string(),
        recordId: v.string(),
        candidateModel: v.string(),
        compareModel: v.optional(v.string()),
        results: v.array(v.object({
            model: v.string(),
            output: v.string(),
            latencyMs: v.number(),
            promptTokens: v.optional(v.number()),
            completionTokens: v.optional(v.number()),
            costGbp: v.optional(v.number()),
            valid: v.boolean(),
            validationError: v.optional(v.string()),
            rawResponse: v.optional(v.any()),
        })),
        runBy: v.string(),
        runAt: v.number(),
    }).index("by_runAt", ["runAt"]),
});
