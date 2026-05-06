import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { ROLES, DEFAULT_ROLE_GAPS_MS, VOICE_SPEC_STUB_BODY, } from "../lib/email-campaigns/roles";
const SKELETON_BRIEFS = {
    orientation: {
        purpose: "Introduce Daniel, set up what's coming, and surface the one most striking finding from the report. Make the reader want the next email.",
        requiredBeats: "Greet them by first name. Reference the URL audited. Surface ONE concrete finding from the report (not the worst score — the most interesting one). Tease one specific weird detail about Daniel's story or the upcoming sequence as an open loop. Promise the next email.",
        loopsToOpen: "One narrative loop pointing at the backstory email — a specific, weird, concrete detail from Daniel's story (e.g. 'why I closed my laptop and walked out for two hours').",
        loopsToClose: "None — first email.",
        tone: "Warm but not over-friendly. Direct. Reads like Daniel sat down after looking at their site and wrote them.",
        lengthGuide: "120-180 words.",
        workedExample: "[FILL IN — write a complete orientation email in Daniel's voice for a fictional plumber who scored 6/10. Use it as a stylistic anchor for the LLM.]",
    },
    backstory: {
        purpose: "Establish where Daniel was before — humanise him, make the reader care. Open the loop that closes in the wall email.",
        requiredBeats: "Brief Royal Marine context (background, not theme). What Daniel was doing before web strategy. What was at risk for him personally.",
        loopsToOpen: "Tease the moment things had to change ('the wall').",
        loopsToClose: "Close the orientation loop's specific detail (deliver the consultant line, the laptop moment, etc.).",
        tone: "Reflective, not dramatic. Specific not vague.",
        lengthGuide: "150-220 words.",
        workedExample: "[FILL IN]",
    },
    wall: {
        purpose: "The crisis point. The moment Daniel realised the old approach wasn't working.",
        requiredBeats: "A specific incident or realisation. What broke. What he saw that he hadn't before. Should mirror the recipient's likely weakness from the report — if their CTA is weak, the wall is when Daniel realised CTAs were the issue. If their messaging is weak, the wall is messaging.",
        loopsToOpen: "Tease the new lens (epiphany).",
        loopsToClose: "Close the loop opened in the backstory email.",
        tone: "Honest. No transformation porn.",
        lengthGuide: "150-220 words.",
        workedExample: "[FILL IN]",
    },
    epiphany: {
        purpose: "The shift in thinking. The new lens. Name the principle the recipient is violating and reframe it.",
        requiredBeats: "The principle (generic). The recipient's specific violation (from the report). Why the old way fails and the new way works.",
        loopsToOpen: "Tease how the new way actually works in practice (application email).",
        loopsToClose: "Close the loop opened in the wall email.",
        tone: "Confident but not preachy.",
        lengthGuide: "180-250 words.",
        workedExample: "[FILL IN]",
    },
    application: {
        purpose: "Show how the new way actually works, with proof. Apply it to the recipient's site.",
        requiredBeats: "Concrete mechanism. Evidence (case, before/after, principle in action). Rewrite one section of the recipient's actual copy, OR describe what their hero would look like fixed.",
        loopsToOpen: "Tease a second-order benefit the reader hasn't thought of (hidden benefits email).",
        loopsToClose: "Close the loop opened in the epiphany email.",
        tone: "Practical. Working-out-loud.",
        lengthGuide: "200-280 words.",
        workedExample: "[FILL IN]",
    },
    hidden_benefits: {
        purpose: "Surface second-order benefits — each quietly answers a likely objection.",
        requiredBeats: "Two or three benefits the reader hadn't considered. Tied to their industry context (plumber's hidden benefits look different from a hearing clinic's). Each benefit pre-empts a different objection.",
        loopsToOpen: "Tease the offer — what comes next, why now.",
        loopsToClose: "Close the loop opened in the application email.",
        tone: "Generous. Like sharing what you've noticed.",
        lengthGuide: "180-250 words.",
        workedExample: "[FILL IN]",
    },
    offer: {
        purpose: "Make the ask. Name the gap between where they are (per their report) and where the offer takes them.",
        requiredBeats: "Reference the specific gap from their report. The offer (subscription tier most appropriate to their score and business). Why now. Clear CTA — reply to the email.",
        loopsToOpen: "None — last email.",
        loopsToClose: "Close every remaining open loop.",
        tone: "Direct. No reluctance theatre.",
        lengthGuide: "180-250 words.",
        workedExample: "[FILL IN]",
    },
};
export const seed = internalMutation({
    args: {},
    handler: async (ctx) => {
        const existingConfig = await ctx.db.query("campaignConfig").first();
        if (existingConfig) {
            console.log("emailCampaigns:seed — already seeded, noop");
            return { seeded: false };
        }
        const now = Date.now();
        const adminEmail = "daniel@dreamfree.co.uk";
        await ctx.db.insert("campaignConfig", {
            globalKillSwitch: true,
            killSwitchUpdatedAt: now,
            fromAddress: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
            defaultLlmModel: "google/gemini-2.5-flash",
            businessHoursEnabled: true,
            businessHoursStartUtcMinutes: 9 * 60,
            businessHoursEndUtcMinutes: 18 * 60,
            businessDays: [1, 2, 3, 4, 5],
            unsubscribeBaseUrl: "https://dreamfree.co.uk/unsubscribe",
        });
        const sequenceId = await ctx.db.insert("emailSequences", {
            name: "Signal Report Soap Opera",
            description: "Triggered when a Signal Report completes. 7 emails, LLM-personalised against the recipient's report findings.",
            trigger: "signal_report_success",
            isActive: true,
            roleGaps: DEFAULT_ROLE_GAPS_MS,
            orientationRespectsBusinessHours: false,
            createdAt: now,
            updatedAt: now,
        });
        for (let i = 0; i < ROLES.length; i++) {
            const role = ROLES[i];
            const skeleton = SKELETON_BRIEFS[role];
            await ctx.db.insert("emailRoleBriefs", {
                sequenceId,
                role,
                order: i,
                purpose: skeleton.purpose,
                requiredBeats: skeleton.requiredBeats,
                loopsToOpen: skeleton.loopsToOpen,
                loopsToClose: skeleton.loopsToClose,
                tone: skeleton.tone,
                lengthGuide: skeleton.lengthGuide,
                workedExample: skeleton.workedExample,
                version: 1,
                isCurrent: true,
                createdAt: now,
                createdBy: adminEmail,
            });
        }
        await ctx.db.insert("emailVoiceSpec", {
            body: VOICE_SPEC_STUB_BODY,
            version: 1,
            isCurrent: true,
            createdAt: now,
            createdBy: adminEmail,
        });
        console.log(`emailCampaigns:seed — inserted config + sequence ${sequenceId} + ${ROLES.length} briefs + voice stub`);
        return { seeded: true, sequenceId };
    },
});
export const getCurrentVoiceSpec = query({
    args: {},
    handler: async (ctx) => {
        const current = await ctx.db
            .query("emailVoiceSpec")
            .withIndex("by_isCurrent", (q) => q.eq("isCurrent", true))
            .first();
        return current;
    },
});
export const listVoiceSpecVersions = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db
            .query("emailVoiceSpec")
            .withIndex("by_version")
            .order("desc")
            .collect();
    },
});
export const saveVoiceSpec = mutation({
    args: {
        body: v.string(),
        editorEmail: v.string(),
    },
    handler: async (ctx, args) => {
        const previous = await ctx.db
            .query("emailVoiceSpec")
            .withIndex("by_isCurrent", (q) => q.eq("isCurrent", true))
            .first();
        if (previous) {
            await ctx.db.patch(previous._id, { isCurrent: false });
        }
        const newVersion = (previous?.version ?? 0) + 1;
        const newId = await ctx.db.insert("emailVoiceSpec", {
            body: args.body,
            version: newVersion,
            isCurrent: true,
            createdAt: Date.now(),
            createdBy: args.editorEmail,
        });
        // Mark drafts in pending_approval/approved enrollments as stale.
        const allEnrollments = await ctx.db.query("emailEnrollments").collect();
        const targets = allEnrollments.filter((e) => e.status === "pending_approval" || e.status === "approved");
        for (const enrollment of targets) {
            const drafts = await ctx.db
                .query("emailDrafts")
                .withIndex("by_enrollment", (q) => q.eq("enrollmentId", enrollment._id))
                .collect();
            for (const draft of drafts) {
                if (draft.status === "sent")
                    continue;
                if (draft.voiceVersionUsed < newVersion && !draft.isStale) {
                    await ctx.db.patch(draft._id, { isStale: true });
                }
            }
        }
        return { newId, version: newVersion };
    },
});
const roleValidator = v.union(v.literal("orientation"), v.literal("backstory"), v.literal("wall"), v.literal("epiphany"), v.literal("application"), v.literal("hidden_benefits"), v.literal("offer"));
export const getCurrentBriefs = query({
    args: { sequenceId: v.id("emailSequences") },
    handler: async (ctx, args) => {
        const briefs = [];
        for (const role of ROLES) {
            const brief = await ctx.db
                .query("emailRoleBriefs")
                .withIndex("by_sequence_role_isCurrent", (q) => q
                .eq("sequenceId", args.sequenceId)
                .eq("role", role)
                .eq("isCurrent", true))
                .first();
            if (brief)
                briefs.push(brief);
        }
        briefs.sort((a, b) => a.order - b.order);
        return briefs;
    },
});
export const getCurrentBrief = query({
    args: {
        sequenceId: v.id("emailSequences"),
        role: roleValidator,
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("emailRoleBriefs")
            .withIndex("by_sequence_role_isCurrent", (q) => q
            .eq("sequenceId", args.sequenceId)
            .eq("role", args.role)
            .eq("isCurrent", true))
            .first();
    },
});
export const listBriefVersions = query({
    args: {
        sequenceId: v.id("emailSequences"),
        role: roleValidator,
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("emailRoleBriefs")
            .withIndex("by_sequence_role_version", (q) => q.eq("sequenceId", args.sequenceId).eq("role", args.role))
            .order("desc")
            .collect();
    },
});
export const saveBrief = mutation({
    args: {
        sequenceId: v.id("emailSequences"),
        role: roleValidator,
        purpose: v.string(),
        requiredBeats: v.string(),
        loopsToOpen: v.string(),
        loopsToClose: v.string(),
        tone: v.string(),
        lengthGuide: v.string(),
        workedExample: v.string(),
        editorEmail: v.string(),
    },
    handler: async (ctx, args) => {
        const previous = await ctx.db
            .query("emailRoleBriefs")
            .withIndex("by_sequence_role_isCurrent", (q) => q
            .eq("sequenceId", args.sequenceId)
            .eq("role", args.role)
            .eq("isCurrent", true))
            .first();
        if (!previous) {
            throw new Error(`No existing brief for sequence=${args.sequenceId} role=${args.role}. Run seed first.`);
        }
        await ctx.db.patch(previous._id, { isCurrent: false });
        const newVersion = previous.version + 1;
        const newId = await ctx.db.insert("emailRoleBriefs", {
            sequenceId: args.sequenceId,
            role: args.role,
            order: previous.order,
            purpose: args.purpose,
            requiredBeats: args.requiredBeats,
            loopsToOpen: args.loopsToOpen,
            loopsToClose: args.loopsToClose,
            tone: args.tone,
            lengthGuide: args.lengthGuide,
            workedExample: args.workedExample,
            version: newVersion,
            isCurrent: true,
            createdAt: Date.now(),
            createdBy: args.editorEmail,
        });
        // Mark drafts in pending_approval/approved enrollments as stale (this role only).
        const allEnrollments = await ctx.db.query("emailEnrollments").collect();
        const targets = allEnrollments.filter((e) => e.sequenceId === args.sequenceId &&
            (e.status === "pending_approval" || e.status === "approved"));
        for (const enrollment of targets) {
            const drafts = await ctx.db
                .query("emailDrafts")
                .withIndex("by_enrollment", (q) => q.eq("enrollmentId", enrollment._id))
                .collect();
            for (const draft of drafts) {
                if (draft.role !== args.role)
                    continue;
                if (draft.status === "sent")
                    continue;
                if (draft.briefVersionUsed < newVersion && !draft.isStale) {
                    await ctx.db.patch(draft._id, { isStale: true });
                }
            }
        }
        return { newId, version: newVersion };
    },
});
// ===== Internal mutations called by the generation action =====
export const insertGeneratedDraft = internalMutation({
    args: {
        enrollmentId: v.id("emailEnrollments"),
        role: roleValidator,
        order: v.number(),
        subject: v.string(),
        bodyHtml: v.string(),
        bodyText: v.string(),
        briefVersionUsed: v.number(),
        voiceVersionUsed: v.number(),
        loopsOpenedHere: v.array(v.string()),
        loopsClosedHere: v.array(v.string()),
        reportFindingsUsed: v.array(v.string()),
        unsubscribeToken: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("emailDrafts", {
            enrollmentId: args.enrollmentId,
            role: args.role,
            order: args.order,
            subject: args.subject,
            bodyHtml: args.bodyHtml,
            bodyText: args.bodyText,
            status: "draft",
            briefVersionUsed: args.briefVersionUsed,
            voiceVersionUsed: args.voiceVersionUsed,
            loopsOpenedHere: args.loopsOpenedHere,
            loopsClosedHere: args.loopsClosedHere,
            reportFindingsUsed: args.reportFindingsUsed,
            isStale: false,
            editedByDaniel: false,
            unsubscribeToken: args.unsubscribeToken,
        });
    },
});
export const setDraftUnsubscribeToken = internalMutation({
    args: {
        draftId: v.id("emailDrafts"),
        token: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.draftId, { unsubscribeToken: args.token });
    },
});
export const updateEnrollmentLoopLedger = internalMutation({
    args: {
        enrollmentId: v.id("emailEnrollments"),
        loopLedger: v.array(v.object({
            id: v.string(),
            openedInRole: v.string(),
            closedInRole: v.optional(v.string()),
            description: v.string(),
        })),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.enrollmentId, {
            loopLedger: args.loopLedger,
        });
    },
});
export const setEnrollmentStatus = internalMutation({
    args: {
        enrollmentId: v.id("emailEnrollments"),
        status: v.union(v.literal("generating"), v.literal("generation_failed"), v.literal("pending_approval"), v.literal("approved"), v.literal("paused"), v.literal("stopped"), v.literal("completed"), v.literal("unsubscribed")),
        generationError: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const patch = { status: args.status };
        if (args.generationError !== undefined) {
            patch.generationError = args.generationError;
        }
        await ctx.db.patch(args.enrollmentId, patch);
    },
});
export const getEnrollmentForGeneration = internalMutation({
    // Read-only logic but uses internalMutation so the action can call it
    // and read fresh state between steps.
    args: { enrollmentId: v.id("emailEnrollments") },
    handler: async (ctx, args) => {
        const enrollment = await ctx.db.get(args.enrollmentId);
        if (!enrollment)
            return null;
        const lead = await ctx.db.get(enrollment.leadId);
        const report = await ctx.db.get(enrollment.reportId);
        const sequence = await ctx.db.get(enrollment.sequenceId);
        const voiceSpec = await ctx.db
            .query("emailVoiceSpec")
            .withIndex("by_isCurrent", (q) => q.eq("isCurrent", true))
            .first();
        // Briefs: one per role, fetch each via the precise indexed lookup.
        const briefs = [];
        for (const role of ROLES) {
            const brief = await ctx.db
                .query("emailRoleBriefs")
                .withIndex("by_sequence_role_isCurrent", (q) => q
                .eq("sequenceId", enrollment.sequenceId)
                .eq("role", role)
                .eq("isCurrent", true))
                .first();
            if (brief)
                briefs.push(brief);
        }
        briefs.sort((a, b) => a.order - b.order);
        const drafts = await ctx.db
            .query("emailDrafts")
            .withIndex("by_enrollment", (q) => q.eq("enrollmentId", args.enrollmentId))
            .collect();
        drafts.sort((a, b) => a.order - b.order);
        return {
            enrollment,
            lead,
            report,
            sequence,
            voiceSpec,
            briefs,
            drafts,
        };
    },
});
