import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  ROLES,
  VOICE_SPEC_STUB_MARKER,
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
import {
  VERIFIER_SYSTEM_PROMPT,
  buildVerifierUserPrompt,
  type DraftForVerifier,
} from "../lib/email-campaigns/verifier-prompt";
import {
  validateVerifierResult,
  VerifierResultError,
} from "../lib/email-campaigns/verifier-result";

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

const VERIFIER_TEMPERATURE = 0.2;

function makeStubVoiceFlags(drafts: DraftForVerifier[]): {
  voice: { role: string; note: string }[];
  loops: never[];
  cheese: never[];
  factual: never[];
} {
  return {
    voice: drafts.map((d) => ({
      role: d.role,
      note: "Voice spec is still the stub. Fill it in before approving.",
    })),
    loops: [],
    cheese: [],
    factual: [],
  };
}

export const verifySequence = internalAction({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const data = await ctx.runMutation(
      internal.emailCampaigns.getEnrollmentForGeneration,
      { enrollmentId: args.enrollmentId },
    );
    if (!data || !data.enrollment || !data.voiceSpec || !data.report) {
      console.error(`verifySequence: missing data for ${args.enrollmentId}`);
      return;
    }

    const draftsForVerifier: DraftForVerifier[] = data.drafts.map((d) => ({
      role: d.role as Role,
      order: d.order,
      subject: d.subject,
      bodyText: d.bodyText,
      loopsOpenedHere: d.loopsOpenedHere,
      loopsClosedHere: d.loopsClosedHere,
      reportFindingsUsed: d.reportFindingsUsed,
    }));

    if (draftsForVerifier.length !== ROLES.length) {
      console.warn(
        `verifySequence: expected ${ROLES.length} drafts, got ${draftsForVerifier.length} — skipping`,
      );
      return;
    }

    // Voice spec stub short-circuit
    if (data.voiceSpec.body.includes(VOICE_SPEC_STUB_MARKER)) {
      const stubFlags = makeStubVoiceFlags(draftsForVerifier);
      await ctx.runMutation(internal.emailCampaigns.setVerificationFlags, {
        enrollmentId: args.enrollmentId,
        flags: stubFlags,
      });
      return;
    }

    const reportSummary = `URL: ${data.report.url}
Customer: ${data.report.customerDescription}
Overall: ${data.report.overallScore}/100
Grunt test: ${data.report.gruntTest.pass ? "pass" : "fail"} — ${data.report.gruntTest.explanation}
Quick win: ${data.report.quickWin}
Strengths: ${data.report.strengths.join("; ")}
Full summary: ${data.report.fullSummary}`;

    const userPrompt = buildVerifierUserPrompt({
      voiceSpec: data.voiceSpec.body,
      drafts: draftsForVerifier,
      reportSummary,
    });

    let raw: string;
    try {
      raw = await callOpenRouter({
        model: MODEL_PRIMARY,
        systemPrompt: VERIFIER_SYSTEM_PROMPT,
        userPrompt,
        temperature: VERIFIER_TEMPERATURE,
        responseFormat: "json_object",
        title: "Dreamfree Email Verifier",
      });
    } catch (primaryErr) {
      const primaryMsg =
        primaryErr instanceof OpenRouterError
          ? primaryErr.message
          : String(primaryErr);
      console.warn(`verifySequence primary failed: ${primaryMsg}`);
      try {
        raw = await callOpenRouter({
          model: MODEL_FALLBACK,
          systemPrompt: VERIFIER_SYSTEM_PROMPT,
          userPrompt,
          temperature: VERIFIER_TEMPERATURE,
          responseFormat: "json_object",
          title: "Dreamfree Email Verifier (fallback)",
        });
      } catch (fallbackErr) {
        const fallbackMsg =
          fallbackErr instanceof OpenRouterError
            ? fallbackErr.message
            : String(fallbackErr);
        console.error(
          `verifySequence both models failed for ${args.enrollmentId}: primary=${primaryMsg}; fallback=${fallbackMsg}`,
        );
        // Don't fail the enrollment — verification is informational. Persist
        // a synthetic flag noting the verifier itself failed.
        await ctx.runMutation(internal.emailCampaigns.setVerificationFlags, {
          enrollmentId: args.enrollmentId,
          flags: {
            voice: [
              {
                role: "sequence",
                note: `Verifier LLM failed: ${fallbackMsg}. Approve manually with caution.`,
              },
            ],
            loops: [],
            cheese: [],
            factual: [],
          },
        });
        return;
      }
    }

    let result;
    try {
      result = validateVerifierResult(parseLlmJson(raw));
    } catch (err) {
      const msg =
        err instanceof VerifierResultError ? err.message : String(err);
      console.error(`verifySequence parse error: ${msg}`);
      await ctx.runMutation(internal.emailCampaigns.setVerificationFlags, {
        enrollmentId: args.enrollmentId,
        flags: {
          voice: [{ role: "sequence", note: `Verifier parse failed: ${msg}` }],
          loops: [],
          cheese: [],
          factual: [],
        },
      });
      return;
    }

    await ctx.runMutation(internal.emailCampaigns.setVerificationFlags, {
      enrollmentId: args.enrollmentId,
      flags: result,
    });
  },
});
