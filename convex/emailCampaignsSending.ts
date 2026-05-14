import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { clampToBusinessHours } from "../lib/email-campaigns/business-hours";
import { sendCampaignEmail } from "../lib/email-campaigns/resend";

/** How long sendDraft waits before retrying itself while the kill switch is on. */
const KILL_SWITCH_RETRY_MS = 60 * 60 * 1000;

// ===== Plain scheduler helpers (shared with emailCampaigns.ts) =====

/**
 * Schedule `sendDraft` for `when`, and mark the draft "scheduled" with the
 * resulting scheduled-function id so it can be cancelled later.
 */
export async function scheduleDraftSend(
  ctx: MutationCtx,
  draftId: Id<"emailDrafts">,
  when: number,
): Promise<void> {
  const fnId = await ctx.scheduler.runAt(
    when,
    internal.emailCampaignsSending.sendDraft,
    { draftId },
  );
  await ctx.db.patch(draftId, {
    status: "scheduled",
    scheduledFor: when,
    scheduledFunctionId: fnId,
  });
}

/**
 * Cancel whichever draft in this enrollment is currently "scheduled" (only one
 * ever is) and reset it back to "draft". No-op if none is scheduled. Returns
 * the affected draft, or null.
 */
export async function cancelScheduledDraft(
  ctx: MutationCtx,
  enrollmentId: Id<"emailEnrollments">,
): Promise<Doc<"emailDrafts"> | null> {
  const drafts = await ctx.db
    .query("emailDrafts")
    .withIndex("by_enrollment", (q) => q.eq("enrollmentId", enrollmentId))
    .collect();
  const scheduled = drafts.find((d) => d.status === "scheduled");
  if (!scheduled) return null;
  if (scheduled.scheduledFunctionId) {
    await ctx.scheduler.cancel(
      scheduled.scheduledFunctionId as Id<"_scheduled_functions">,
    );
  }
  await ctx.db.patch(scheduled._id, {
    status: "draft",
    scheduledFor: undefined,
    scheduledFunctionId: undefined,
  });
  return scheduled;
}

// ===== Read context for the send chokepoint =====

export const getSendContext = internalQuery({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) return null;
    const enrollment = await ctx.db.get(draft.enrollmentId);
    if (!enrollment) return null;
    const lead = await ctx.db.get(enrollment.leadId);
    const report = await ctx.db.get(enrollment.reportId);
    const sequence = await ctx.db.get(enrollment.sequenceId);
    const config = await ctx.db.query("campaignConfig").first();

    // Guard 3 input: this draft was hand-edited AND a later draft is stale.
    let laterStaleExists = false;
    if (draft.editedByDaniel) {
      const siblings = await ctx.db
        .query("emailDrafts")
        .withIndex("by_enrollment", (q) =>
          q.eq("enrollmentId", draft.enrollmentId),
        )
        .collect();
      laterStaleExists = siblings.some(
        (d) => d.order > draft.order && d.isStale && d.status !== "sent",
      );
    }

    // Guard 4 input: the recipient is on the global suppression list.
    let isSuppressed = false;
    if (lead) {
      const suppression = await ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", lead.email))
        .first();
      isSuppressed = suppression !== null;
    }

    return {
      draft,
      enrollment,
      lead,
      report,
      sequence,
      config,
      laterStaleExists,
      isSuppressed,
    };
  },
});

// ===== Guard-outcome mutations =====

export const rescheduleDraftForKillSwitch = internalMutation({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, args) => {
    const when = Date.now() + KILL_SWITCH_RETRY_MS;
    const fnId = await ctx.scheduler.runAt(
      when,
      internal.emailCampaignsSending.sendDraft,
      { draftId: args.draftId },
    );
    await ctx.db.patch(args.draftId, {
      status: "scheduled",
      scheduledFor: when,
      scheduledFunctionId: fnId,
    });
  },
});

export const applySendSkip = internalMutation({
  args: {
    draftId: v.id("emailDrafts"),
    kind: v.union(
      v.literal("terminal"),
      v.literal("stale_cascade"),
      v.literal("suppressed"),
    ),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("applySendSkip: draft not found");

    if (args.kind === "suppressed") {
      await ctx.db.patch(args.draftId, { status: "skipped_suppressed" });
      await ctx.db.patch(draft.enrollmentId, { status: "unsubscribed" });
      return;
    }

    // terminal + stale_cascade both mark the draft skipped_terminal.
    await ctx.db.patch(args.draftId, { status: "skipped_terminal" });
    if (args.kind === "stale_cascade") {
      await ctx.db.patch(draft.enrollmentId, {
        status: "paused",
        pausedReason: "stale_cascade",
        pausedAt: Date.now(),
      });
    }
  },
});

export const markDraftFailed = internalMutation({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.draftId, { status: "failed" });
  },
});

export const recordSendAndScheduleNext = internalMutation({
  args: {
    draftId: v.id("emailDrafts"),
    resendId: v.string(),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("recordSendAndScheduleNext: draft not found");
    const enrollment = await ctx.db.get(draft.enrollmentId);
    if (!enrollment) {
      throw new Error("recordSendAndScheduleNext: enrollment gone");
    }

    const now = Date.now();
    await ctx.db.patch(args.draftId, { status: "sent", sentAt: now });
    await ctx.db.insert("emailSends", {
      enrollmentId: draft.enrollmentId,
      draftId: args.draftId,
      leadId: enrollment.leadId,
      subject: draft.subject,
      resendId: args.resendId,
      status: "sent",
      sentAt: now,
    });

    // The offer is the last email — complete the enrollment, schedule nothing.
    if (draft.role === "offer") {
      await ctx.db.patch(draft.enrollmentId, {
        status: "completed",
        completedAt: now,
      });
      return;
    }

    // Otherwise schedule the next draft, clamped to business hours.
    const sequence = await ctx.db.get(enrollment.sequenceId);
    const config = await ctx.db.query("campaignConfig").first();
    if (!sequence || !config) {
      console.error(
        `recordSendAndScheduleNext: missing sequence/config for enrollment ${draft.enrollmentId} — cannot schedule next`,
      );
      return;
    }
    const nextOrder = draft.order + 1;
    const nextDraft = (
      await ctx.db
        .query("emailDrafts")
        .withIndex("by_enrollment", (q) =>
          q.eq("enrollmentId", draft.enrollmentId),
        )
        .collect()
    ).find((d) => d.order === nextOrder);
    if (!nextDraft) {
      console.error(
        `recordSendAndScheduleNext: no draft at order ${nextOrder} for enrollment ${draft.enrollmentId}`,
      );
      return;
    }
    const gap = sequence.roleGaps[nextOrder] ?? 0;
    const when = clampToBusinessHours(now + gap, config);
    await scheduleDraftSend(ctx, nextDraft._id, when);
  },
});

// ===== sendDraft action — the send chokepoint =====

/** Enrollment statuses at which a scheduled send must be abandoned. */
const TERMINAL_ENROLLMENT_STATUSES = [
  "paused",
  "stopped",
  "unsubscribed",
  "completed",
  "generation_failed",
];

/**
 * The send chokepoint. Runs five ordered guards, then sends via Resend and
 * (on success) lets `recordSendAndScheduleNext` advance the chain. Every
 * campaign email — orientation, every chained email, every kill-switch
 * retry — passes through here.
 */
export const sendDraft = internalAction({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.emailCampaignsSending.getSendContext,
      { draftId: args.draftId },
    );
    if (!context) {
      console.error(`sendDraft: no context for draft ${args.draftId} — noop`);
      return;
    }
    const {
      draft,
      enrollment,
      lead,
      report,
      config,
      laterStaleExists,
      isSuppressed,
    } = context;

    // Guard 0 (defensive): only act on a draft that is actually scheduled.
    // Pause clears the draft back to "draft" and cancels the scheduled fn; a
    // resumed/already-sent draft must not be re-sent.
    if (draft.status !== "scheduled") {
      console.log(
        `sendDraft: draft ${args.draftId} status=${draft.status}, not scheduled — noop`,
      );
      return;
    }

    if (!config) {
      console.error(
        `sendDraft: campaignConfig missing — marking draft ${args.draftId} failed`,
      );
      await ctx.runMutation(internal.emailCampaignsSending.markDraftFailed, {
        draftId: args.draftId,
      });
      return;
    }

    // Guard 1: global kill switch. Reschedule self for +1h, keep status scheduled.
    if (config.globalKillSwitch) {
      await ctx.runMutation(
        internal.emailCampaignsSending.rescheduleDraftForKillSwitch,
        { draftId: args.draftId },
      );
      return;
    }

    // Guard 2: terminal enrollment status.
    if (TERMINAL_ENROLLMENT_STATUSES.includes(enrollment.status)) {
      await ctx.runMutation(internal.emailCampaignsSending.applySendSkip, {
        draftId: args.draftId,
        kind: "terminal",
      });
      return;
    }

    // Guard 3: stale-cascade — this draft was hand-edited and a later draft is
    // stale. Refuse to send and pause loudly so Daniel regenerates.
    if (draft.editedByDaniel && laterStaleExists) {
      await ctx.runMutation(internal.emailCampaignsSending.applySendSkip, {
        draftId: args.draftId,
        kind: "stale_cascade",
      });
      return;
    }

    // Guard 4: recipient on the global suppression list.
    if (isSuppressed) {
      await ctx.runMutation(internal.emailCampaignsSending.applySendSkip, {
        draftId: args.draftId,
        kind: "suppressed",
      });
      return;
    }

    // Guard 5: send.
    if (!lead || !report) {
      console.error(
        `sendDraft: missing lead/report for draft ${args.draftId} — marking failed`,
      );
      await ctx.runMutation(internal.emailCampaignsSending.markDraftFailed, {
        draftId: args.draftId,
      });
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const result = await sendCampaignEmail({
      from: config.fromAddress,
      to: lead.email,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      bodyText: draft.bodyText,
      reportUrl: report.url,
      unsubscribeUrl: `${config.unsubscribeBaseUrl}?t=${draft.unsubscribeToken}`,
      listUnsubscribePostUrl: `${siteUrl}/api/email-campaigns/unsubscribe?t=${draft.unsubscribeToken}`,
      tags: {
        enrollmentId: enrollment._id,
        draftId: draft._id,
        role: draft.role,
      },
    });

    if (result.ok) {
      await ctx.runMutation(
        internal.emailCampaignsSending.recordSendAndScheduleNext,
        { draftId: args.draftId, resendId: result.resendId },
      );
    } else {
      console.error(
        `sendDraft: Resend send failed for draft ${args.draftId}: ${result.error}`,
      );
      await ctx.runMutation(internal.emailCampaignsSending.markDraftFailed, {
        draftId: args.draftId,
      });
    }
  },
});
