import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
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
const flagArrayValidator = v.array(v.object({ role: v.string(), note: v.string() }));
export const setVerificationFlags = internalMutation({
    args: {
        enrollmentId: v.id("emailEnrollments"),
        flags: v.object({
            voice: flagArrayValidator,
            loops: flagArrayValidator,
            cheese: flagArrayValidator,
            factual: flagArrayValidator,
        }),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.enrollmentId, {
            verificationFlags: args.flags,
        });
    },
});
/**
 * Called by signalReportsAction after a successful Signal Report. Returns the
 * new enrollmentId if one was created, or null if the trigger was skipped
 * (suppression / duplicate enrollment / no active sequence / no voice spec).
 */
export const tryEnrolFromReport = internalMutation({
    args: {
        reportId: v.id("signalReports"),
    },
    returns: v.union(v.id("emailEnrollments"), v.null()),
    handler: async (ctx, args) => {
        const report = await ctx.db.get(args.reportId);
        if (!report) {
            console.warn(`tryEnrolFromReport: report ${args.reportId} not found`);
            return null;
        }
        if (report.status !== "success") {
            console.warn(`tryEnrolFromReport: report ${args.reportId} status=${report.status}, skipping`);
            return null;
        }
        const lead = await ctx.db.get(report.leadId);
        if (!lead) {
            console.warn(`tryEnrolFromReport: lead ${report.leadId} not found`);
            return null;
        }
        // Suppression guard
        const suppression = await ctx.db
            .query("emailSuppressions")
            .withIndex("by_email", (q) => q.eq("email", lead.email))
            .first();
        if (suppression) {
            console.log(`tryEnrolFromReport: ${lead.email} suppressed (${suppression.reason}), skipping`);
            return null;
        }
        // Active enrollment guard
        const existing = await ctx.db
            .query("emailEnrollments")
            .withIndex("by_leadId", (q) => q.eq("leadId", report.leadId))
            .collect();
        const blocking = existing.find((e) => [
            "generating",
            "pending_approval",
            "approved",
            "paused",
        ].includes(e.status));
        if (blocking) {
            console.log(`tryEnrolFromReport: lead ${report.leadId} already has enrollment ${blocking._id} status=${blocking.status}, skipping`);
            return null;
        }
        // Sequence active guard
        const sequence = await ctx.db
            .query("emailSequences")
            .withIndex("by_trigger", (q) => q.eq("trigger", "signal_report_success"))
            .first();
        if (!sequence || !sequence.isActive) {
            console.log(`tryEnrolFromReport: no active sequence for signal_report_success, skipping`);
            return null;
        }
        const voiceSpec = await ctx.db
            .query("emailVoiceSpec")
            .withIndex("by_isCurrent", (q) => q.eq("isCurrent", true))
            .first();
        if (!voiceSpec) {
            console.error(`tryEnrolFromReport: no current voice spec, skipping`);
            return null;
        }
        const enrollmentId = await ctx.db.insert("emailEnrollments", {
            leadId: report.leadId,
            sequenceId: sequence._id,
            reportId: args.reportId,
            status: "generating",
            voiceVersionUsed: voiceSpec.version,
            loopLedger: [],
            enrolledAt: Date.now(),
        });
        return enrollmentId;
    },
});
// ===== Read-only inspection queries =====
export const listEnrollments = query({
    args: {
        status: v.optional(v.union(v.literal("generating"), v.literal("generation_failed"), v.literal("pending_approval"), v.literal("approved"), v.literal("paused"), v.literal("stopped"), v.literal("completed"), v.literal("unsubscribed"))),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        const status = args.status;
        const q = status
            ? ctx.db
                .query("emailEnrollments")
                .withIndex("by_status", (qb) => qb.eq("status", status))
            : ctx.db.query("emailEnrollments");
        return await q.order("desc").take(limit);
    },
});
export const getEnrollmentWithDrafts = query({
    args: { enrollmentId: v.id("emailEnrollments") },
    handler: async (ctx, args) => {
        const enrollment = await ctx.db.get(args.enrollmentId);
        if (!enrollment)
            return null;
        const drafts = await ctx.db
            .query("emailDrafts")
            .withIndex("by_enrollment", (q) => q.eq("enrollmentId", args.enrollmentId))
            .collect();
        drafts.sort((a, b) => a.order - b.order);
        const lead = await ctx.db.get(enrollment.leadId);
        const report = await ctx.db.get(enrollment.reportId);
        return { enrollment, drafts, lead, report };
    },
});
export const getCampaignConfig = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("campaignConfig").first();
    },
});
// ===== Config mutations (used by the overview page kill switch and sequence editor) =====
export const setKillSwitch = mutation({
    args: {
        on: v.boolean(),
        note: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const config = await ctx.db.query("campaignConfig").first();
        if (!config) {
            throw new Error("campaignConfig row missing — run emailCampaigns:seed first");
        }
        await ctx.db.patch(config._id, {
            // globalKillSwitch true = sending OFF, false = sending ON
            globalKillSwitch: !args.on,
            killSwitchNote: args.note,
            killSwitchUpdatedAt: Date.now(),
        });
    },
});
export const setRoleGaps = mutation({
    args: {
        sequenceId: v.id("emailSequences"),
        roleGaps: v.array(v.number()),
        orientationRespectsBusinessHours: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const sequence = await ctx.db.get(args.sequenceId);
        if (!sequence)
            throw new Error(`Sequence ${args.sequenceId} not found`);
        if (args.roleGaps.length !== ROLES.length) {
            throw new Error(`roleGaps must have ${ROLES.length} entries, got ${args.roleGaps.length}`);
        }
        if (args.roleGaps.some((g) => g < 0 || !Number.isFinite(g))) {
            throw new Error("roleGaps must all be finite non-negative numbers");
        }
        await ctx.db.patch(args.sequenceId, {
            roleGaps: args.roleGaps,
            orientationRespectsBusinessHours: args.orientationRespectsBusinessHours ??
                sequence.orientationRespectsBusinessHours,
            updatedAt: Date.now(),
        });
    },
});
// ===== Enrollment status mutations =====
export const approveEnrollment = mutation({
    args: { enrollmentId: v.id("emailEnrollments") },
    handler: async (ctx, args) => {
        const enrollment = await ctx.db.get(args.enrollmentId);
        if (!enrollment)
            throw new Error("Enrollment not found");
        if (enrollment.status !== "pending_approval") {
            throw new Error(`Cannot approve from status=${enrollment.status} (must be pending_approval)`);
        }
        await ctx.db.patch(args.enrollmentId, {
            status: "approved",
            approvedAt: Date.now(),
        });
        // NB: scheduling of the orientation send happens in Plan 3.
    },
});
export const pauseEnrollment = mutation({
    args: {
        enrollmentId: v.id("emailEnrollments"),
        reason: v.union(v.literal("replied"), v.literal("manual")),
    },
    handler: async (ctx, args) => {
        const enrollment = await ctx.db.get(args.enrollmentId);
        if (!enrollment)
            throw new Error("Enrollment not found");
        if (enrollment.status !== "approved") {
            throw new Error(`Cannot pause from status=${enrollment.status} (must be approved)`);
        }
        await ctx.db.patch(args.enrollmentId, {
            status: "paused",
            pausedReason: args.reason,
            pausedAt: Date.now(),
        });
    },
});
export const resumeEnrollment = mutation({
    args: { enrollmentId: v.id("emailEnrollments") },
    handler: async (ctx, args) => {
        const enrollment = await ctx.db.get(args.enrollmentId);
        if (!enrollment)
            throw new Error("Enrollment not found");
        if (enrollment.status !== "paused") {
            throw new Error(`Cannot resume from status=${enrollment.status} (must be paused)`);
        }
        await ctx.db.patch(args.enrollmentId, {
            status: "approved",
            pausedReason: undefined,
            pausedAt: undefined,
        });
        // NB: re-scheduling of the next pending draft happens in Plan 3.
    },
});
export const stopEnrollment = mutation({
    args: { enrollmentId: v.id("emailEnrollments") },
    handler: async (ctx, args) => {
        const enrollment = await ctx.db.get(args.enrollmentId);
        if (!enrollment)
            throw new Error("Enrollment not found");
        if (enrollment.status === "completed" ||
            enrollment.status === "stopped" ||
            enrollment.status === "unsubscribed") {
            throw new Error(`Cannot stop from status=${enrollment.status} (already terminal)`);
        }
        await ctx.db.patch(args.enrollmentId, {
            status: "stopped",
            stoppedAt: Date.now(),
        });
    },
});
// ===== Draft editing =====
export const saveDraftEdit = mutation({
    args: {
        draftId: v.id("emailDrafts"),
        subject: v.string(),
        bodyHtml: v.string(),
        bodyText: v.string(),
    },
    handler: async (ctx, args) => {
        const draft = await ctx.db.get(args.draftId);
        if (!draft)
            throw new Error("Draft not found");
        if (draft.status === "sent") {
            throw new Error("Cannot edit a sent draft");
        }
        await ctx.db.patch(args.draftId, {
            subject: args.subject,
            bodyHtml: args.bodyHtml,
            bodyText: args.bodyText,
            editedByDaniel: true,
            // Edits clear staleness on this draft — the user has explicitly chosen
            // this content. Later drafts get marked stale below.
            isStale: false,
        });
        // Cascade: mark all later drafts in the same enrollment as stale.
        const laterDrafts = await ctx.db
            .query("emailDrafts")
            .withIndex("by_enrollment", (q) => q.eq("enrollmentId", draft.enrollmentId))
            .collect();
        for (const later of laterDrafts) {
            if (later.order <= draft.order)
                continue;
            if (later.status === "sent")
                continue;
            if (!later.isStale) {
                await ctx.db.patch(later._id, { isStale: true });
            }
        }
    },
});
// ===== Manual suppression (used by the lead detail page) =====
export const suppressEmail = mutation({
    args: {
        email: v.string(),
        note: v.optional(v.string()),
        enrollmentId: v.optional(v.id("emailEnrollments")),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("emailSuppressions")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();
        if (existing) {
            // Idempotent — already suppressed.
            return { alreadySuppressed: true };
        }
        await ctx.db.insert("emailSuppressions", {
            email: args.email,
            reason: "manual",
            suppressedAt: Date.now(),
            enrollmentId: args.enrollmentId,
            note: args.note,
        });
        // If a current enrollment is provided and active, terminate it.
        if (args.enrollmentId) {
            const enrollment = await ctx.db.get(args.enrollmentId);
            if (enrollment &&
                enrollment.status !== "completed" &&
                enrollment.status !== "stopped" &&
                enrollment.status !== "unsubscribed") {
                await ctx.db.patch(args.enrollmentId, {
                    status: "unsubscribed",
                });
            }
        }
        return { alreadySuppressed: false };
    },
});
// ===== Regeneration =====
export const prepareRegenerationFromRole = internalMutation({
    args: {
        enrollmentId: v.id("emailEnrollments"),
        fromOrder: v.number(),
    },
    handler: async (ctx, args) => {
        const enrollment = await ctx.db.get(args.enrollmentId);
        if (!enrollment)
            throw new Error("Enrollment not found");
        if (args.fromOrder < 0 || args.fromOrder >= ROLES.length) {
            throw new Error(`fromOrder must be 0..${ROLES.length - 1}, got ${args.fromOrder}`);
        }
        // Refuse to regenerate any draft that has already been sent.
        const drafts = await ctx.db
            .query("emailDrafts")
            .withIndex("by_enrollment", (q) => q.eq("enrollmentId", args.enrollmentId))
            .collect();
        const sentBeyond = drafts.find((d) => d.order >= args.fromOrder && d.status === "sent");
        if (sentBeyond) {
            throw new Error(`Cannot regenerate from order ${args.fromOrder}: draft ${sentBeyond.role} has already been sent`);
        }
        // Delete drafts at and beyond fromOrder.
        for (const draft of drafts) {
            if (draft.order >= args.fromOrder) {
                await ctx.db.delete(draft._id);
            }
        }
        // Reset loop ledger: drop entries opened at or after fromOrder; for kept
        // entries, clear closedInRole if it was set by a draft we just deleted.
        const ROLE_TO_INDEX = new Map(ROLES.map((r, i) => [r, i]));
        const newLedger = enrollment.loopLedger
            .filter((entry) => {
            const openIdx = ROLE_TO_INDEX.get(entry.openedInRole);
            return openIdx !== undefined && openIdx < args.fromOrder;
        })
            .map((entry) => {
            const closeIdx = entry.closedInRole
                ? ROLE_TO_INDEX.get(entry.closedInRole)
                : undefined;
            if (closeIdx !== undefined && closeIdx >= args.fromOrder) {
                return { ...entry, closedInRole: undefined };
            }
            return entry;
        });
        await ctx.db.patch(args.enrollmentId, {
            loopLedger: newLedger,
            // Re-enter the generating state so the UI knows things are in flight.
            status: "generating",
            verificationFlags: undefined,
            generationError: undefined,
        });
    },
});
export const requestRegeneration = mutation({
    args: {
        enrollmentId: v.id("emailEnrollments"),
        fromOrder: v.number(),
    },
    handler: async (ctx, args) => {
        const enrollment = await ctx.db.get(args.enrollmentId);
        if (!enrollment)
            throw new Error("Enrollment not found");
        if (enrollment.status === "completed" ||
            enrollment.status === "stopped" ||
            enrollment.status === "unsubscribed" ||
            enrollment.status === "generating") {
            throw new Error(`Cannot regenerate from status=${enrollment.status}`);
        }
        await ctx.scheduler.runAfter(0, internal.emailCampaignsAction.regenerateFromRole, { enrollmentId: args.enrollmentId, fromOrder: args.fromOrder });
    },
});
