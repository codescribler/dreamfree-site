import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  ROLES,
  type Role,
} from "../lib/email-campaigns/roles";
import {
  callOpenRouter,
  parseLlmJson,
  OpenRouterError,
} from "../lib/email-campaigns/openrouter";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  type LoopLedgerEntry,
  type PriorDraft,
  type ReportForPrompt,
} from "../lib/email-campaigns/generation-prompt";
import {
  validateGenerationResult,
  GenerationResultError,
} from "../lib/email-campaigns/generation-result";
import { signUnsubscribeToken } from "../lib/email-campaigns/unsubscribe-token";

const MODEL_PRIMARY = "google/gemini-2.5-flash";
const MODEL_FALLBACK = "qwen/qwen3.6-plus";

export const generateSequence = internalAction({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const data = await ctx.runMutation(
      internal.emailCampaigns.getEnrollmentForGeneration,
      { enrollmentId: args.enrollmentId },
    );
    if (!data || !data.enrollment) {
      console.error(
        `generateSequence: enrollment ${args.enrollmentId} not found`,
      );
      return;
    }

    const { enrollment, lead, report, voiceSpec, briefs, drafts } = data;

    if (!lead || !report || !voiceSpec || briefs.length !== ROLES.length) {
      await ctx.runMutation(internal.emailCampaigns.setEnrollmentStatus, {
        enrollmentId: args.enrollmentId,
        status: "generation_failed",
        generationError: `Missing dependencies (lead=${!!lead}, report=${!!report}, voiceSpec=${!!voiceSpec}, briefs=${briefs.length})`,
      });
      return;
    }

    const system = buildGenerationSystemPrompt(voiceSpec.body);
    const reportForPrompt: ReportForPrompt = {
      url: report.url,
      customerDescription: report.customerDescription,
      overallScore: report.overallScore,
      gruntTest: report.gruntTest,
      elements: report.elements,
      quickWin: report.quickWin,
      strengths: report.strengths,
      fullSummary: report.fullSummary,
    };

    // Build priorDrafts from any drafts already inserted (e.g. partial regen).
    const priorDrafts: PriorDraft[] = drafts.map((d) => ({
      role: d.role as Role,
      subject: d.subject,
      bodyText: d.bodyText,
    }));

    // Reconstruct the live loop ledger from the enrollment.
    let loopLedger: LoopLedgerEntry[] = [...enrollment.loopLedger];

    const firstNameCandidate =
      lead.firstName?.trim() || lead.name?.split(" ")[0] || "there";

    for (let i = priorDrafts.length; i < ROLES.length; i++) {
      const role = ROLES[i];
      const brief = briefs.find((b) => b.role === role);
      if (!brief) {
        await ctx.runMutation(internal.emailCampaigns.setEnrollmentStatus, {
          enrollmentId: args.enrollmentId,
          status: "generation_failed",
          generationError: `No current brief for role ${role}`,
        });
        return;
      }

      const userPrompt = buildGenerationUserPrompt({
        voiceSpec: voiceSpec.body,
        recipientFirstName: firstNameCandidate,
        recipientEmail: lead.email,
        report: reportForPrompt,
        role,
        brief: {
          purpose: brief.purpose,
          requiredBeats: brief.requiredBeats,
          loopsToOpen: brief.loopsToOpen,
          loopsToClose: brief.loopsToClose,
          tone: brief.tone,
          lengthGuide: brief.lengthGuide,
          workedExample: brief.workedExample,
        },
        priorDrafts,
        loopLedger,
      });

      let raw: string;
      try {
        raw = await callOpenRouter({
          model: MODEL_PRIMARY,
          systemPrompt: system,
          userPrompt,
          temperature: 0.7,
          responseFormat: "json_object",
          title: "Dreamfree Email Sequence Generation",
        });
      } catch (primaryErr) {
        const primaryMsg =
          primaryErr instanceof OpenRouterError
            ? primaryErr.message
            : String(primaryErr);
        console.warn(
          `generateSequence primary failed for role=${role} enrollment=${args.enrollmentId}: ${primaryMsg}`,
        );
        try {
          raw = await callOpenRouter({
            model: MODEL_FALLBACK,
            systemPrompt: system,
            userPrompt,
            temperature: 0.7,
            responseFormat: "json_object",
            title: "Dreamfree Email Sequence Generation (fallback)",
          });
        } catch (fallbackErr) {
          const fallbackMsg =
            fallbackErr instanceof OpenRouterError
              ? fallbackErr.message
              : String(fallbackErr);
          await ctx.runMutation(
            internal.emailCampaigns.setEnrollmentStatus,
            {
              enrollmentId: args.enrollmentId,
              status: "generation_failed",
              generationError: `Role ${role}: primary=${primaryMsg}; fallback=${fallbackMsg}`,
            },
          );
          return;
        }
      }

      let result;
      try {
        result = validateGenerationResult(parseLlmJson(raw));
      } catch (err) {
        const msg =
          err instanceof GenerationResultError ? err.message : String(err);
        await ctx.runMutation(internal.emailCampaigns.setEnrollmentStatus, {
          enrollmentId: args.enrollmentId,
          status: "generation_failed",
          generationError: `Role ${role} parse: ${msg}. Raw: ${raw.slice(0, 500)}`,
        });
        return;
      }

      // Update loop ledger
      const newlyOpened = result.loopsOpened.map((l) => ({
        id: l.id,
        openedInRole: role,
        description: l.description,
      }));
      loopLedger = [
        ...loopLedger.map((entry) =>
          result.loopsClosed.includes(entry.id) && !entry.closedInRole
            ? { ...entry, closedInRole: role }
            : entry,
        ),
        ...newlyOpened.filter(
          (n) => !loopLedger.some((existing) => existing.id === n.id),
        ),
      ];

      // Insert the draft (with placeholder unsubscribe token — re-signed below
      // once we have the draft id, since the token includes it.)
      const draftId = await ctx.runMutation(
        internal.emailCampaigns.insertGeneratedDraft,
        {
          enrollmentId: args.enrollmentId,
          role,
          order: i,
          subject: result.subject,
          bodyHtml: result.bodyHtml,
          bodyText: result.bodyText,
          briefVersionUsed: brief.version,
          voiceVersionUsed: voiceSpec.version,
          loopsOpenedHere: result.loopsOpened.map((l) => l.id),
          loopsClosedHere: result.loopsClosed,
          reportFindingsUsed: result.reportFindingsUsed,
          unsubscribeToken: "PENDING",
        },
      );

      const realToken = await signUnsubscribeToken({
        enrollmentId: args.enrollmentId,
        draftId,
      });
      await ctx.runMutation(
        internal.emailCampaigns.setDraftUnsubscribeToken,
        { draftId, token: realToken },
      );

      // Persist the updated loop ledger after every successful draft so a
      // partial failure leaves the enrollment in a consistent state we can
      // resume from.
      await ctx.runMutation(
        internal.emailCampaigns.updateEnrollmentLoopLedger,
        { enrollmentId: args.enrollmentId, loopLedger },
      );

      priorDrafts.push({
        role,
        subject: result.subject,
        bodyText: result.bodyText,
      });
    }

    await ctx.runMutation(internal.emailCampaigns.setEnrollmentStatus, {
      enrollmentId: args.enrollmentId,
      status: "pending_approval",
    });

    // Verifier pass scheduled in next task.
    await ctx.scheduler.runAfter(
      0,
      internal.emailCampaignsAction.verifySequence,
      { enrollmentId: args.enrollmentId },
    );
  },
});

// Stub — replaced by Task 11. Without the stub the scheduler call above won't
// typecheck during this commit.
export const verifySequence = internalAction({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (_ctx, args) => {
    console.log(
      `verifySequence stub for ${args.enrollmentId} — implemented in next task`,
    );
  },
});
