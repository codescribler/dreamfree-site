import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { cancelScheduledDraft } from "./emailCampaignsSending";
import { verifyUnsubscribeToken } from "../lib/email-campaigns/unsubscribe-token";

/** Insert a suppression row for `email` if one does not already exist. */
async function ensureSuppressed(
  ctx: MutationCtx,
  email: string,
  reason: "unsubscribed" | "bounced" | "complained" | "manual",
  enrollmentId?: Id<"emailEnrollments">,
): Promise<void> {
  const existing = await ctx.db
    .query("emailSuppressions")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (existing) return;
  await ctx.db.insert("emailSuppressions", {
    email,
    reason,
    suppressedAt: Date.now(),
    enrollmentId,
  });
}

/**
 * Apply one parsed Resend webhook event. Public because Next.js's
 * ConvexHttpClient can only call public functions — guarded by a shared
 * secret. Signature verification itself happens in the Next.js route (it
 * needs the raw body + svix headers).
 */
export const recordResendEvent = mutation({
  args: {
    webhookSecret: v.string(),
    eventType: v.union(
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("complained"),
    ),
    resendId: v.string(),
    occurredAt: v.number(),
    clickedUrl: v.optional(v.string()),
  },
  returns: v.object({ matched: v.boolean() }),
  handler: async (ctx, args) => {
    const expectedSecret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
    if (!expectedSecret || args.webhookSecret !== expectedSecret) {
      throw new Error("recordResendEvent: webhook secret mismatch");
    }

    const send = await ctx.db
      .query("emailSends")
      .withIndex("by_resendId", (q) => q.eq("resendId", args.resendId))
      .first();
    if (!send) {
      console.warn(
        `recordResendEvent: no emailSends row for resendId=${args.resendId} (event=${args.eventType})`,
      );
      return { matched: false };
    }

    switch (args.eventType) {
      case "delivered": {
        // Only promote forward — never downgrade opened/clicked back.
        if (send.status === "sent") {
          await ctx.db.patch(send._id, { status: "delivered" });
        }
        break;
      }
      case "opened": {
        if (send.openedAt === undefined) {
          await ctx.db.patch(send._id, { openedAt: args.occurredAt });
        }
        if (send.status === "sent" || send.status === "delivered") {
          await ctx.db.patch(send._id, { status: "opened" });
        }
        break;
      }
      case "clicked": {
        await ctx.db.patch(send._id, {
          status: "clicked",
          clickedAt: args.occurredAt,
          clickedUrl: args.clickedUrl,
        });
        break;
      }
      case "bounced":
      case "complained": {
        const reason =
          args.eventType === "bounced" ? "bounced" : "complained";
        await ctx.db.patch(send._id, {
          status: reason,
          ...(args.eventType === "bounced"
            ? { bouncedAt: args.occurredAt }
            : {}),
        });
        const lead = await ctx.db.get(send.leadId);
        if (lead) {
          await ensureSuppressed(ctx, lead.email, reason, send.enrollmentId);
        }
        const enrollment = await ctx.db.get(send.enrollmentId);
        if (
          enrollment &&
          enrollment.status !== "completed" &&
          enrollment.status !== "stopped" &&
          enrollment.status !== "unsubscribed"
        ) {
          await ctx.db.patch(send.enrollmentId, { status: "unsubscribed" });
        }
        // Stop the next scheduled email from going out.
        await cancelScheduledDraft(ctx, send.enrollmentId);
        break;
      }
    }

    return { matched: true };
  },
});

/**
 * One-click unsubscribe. Verifies the HMAC token itself (the token is the
 * authorization), then suppresses the email, unsubscribes the enrollment, and
 * cancels any scheduled send. Idempotent.
 */
export const processUnsubscribe = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      alreadyProcessed: v.boolean(),
      email: v.string(),
    }),
    v.object({ ok: v.literal(false), reason: v.literal("invalid_token") }),
  ),
  handler: async (ctx, args) => {
    const payload = await verifyUnsubscribeToken(args.token);
    if (!payload) {
      return { ok: false as const, reason: "invalid_token" as const };
    }

    const enrollment = await ctx.db.get(
      payload.enrollmentId as Id<"emailEnrollments">,
    );
    if (!enrollment) {
      return { ok: false as const, reason: "invalid_token" as const };
    }
    const lead = await ctx.db.get(enrollment.leadId);
    if (!lead) {
      return { ok: false as const, reason: "invalid_token" as const };
    }

    const existing = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", lead.email))
      .first();
    if (existing) {
      // Already suppressed — make sure the enrollment is consistent, but do
      // not insert a duplicate row.
      if (enrollment.status !== "unsubscribed") {
        await ctx.db.patch(enrollment._id, { status: "unsubscribed" });
        await cancelScheduledDraft(ctx, enrollment._id);
      }
      return {
        ok: true as const,
        alreadyProcessed: true,
        email: lead.email,
      };
    }

    await ctx.db.insert("emailSuppressions", {
      email: lead.email,
      reason: "unsubscribed",
      suppressedAt: Date.now(),
      enrollmentId: enrollment._id,
    });
    await ctx.db.patch(enrollment._id, { status: "unsubscribed" });
    await cancelScheduledDraft(ctx, enrollment._id);

    return { ok: true as const, alreadyProcessed: false, email: lead.email };
  },
});

/**
 * "I unsubscribed by accident." Removes the unsubscribe suppression and parks
 * the enrollment in "paused" so Daniel reviews before any further sends.
 * Only undoes `unsubscribed` suppressions — never bounce/complaint ones.
 */
export const undoUnsubscribe = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.literal("invalid_token") }),
  ),
  handler: async (ctx, args) => {
    const payload = await verifyUnsubscribeToken(args.token);
    if (!payload) {
      return { ok: false as const, reason: "invalid_token" as const };
    }

    const enrollment = await ctx.db.get(
      payload.enrollmentId as Id<"emailEnrollments">,
    );
    if (!enrollment) {
      return { ok: false as const, reason: "invalid_token" as const };
    }
    const lead = await ctx.db.get(enrollment.leadId);
    if (!lead) {
      return { ok: false as const, reason: "invalid_token" as const };
    }

    const suppression = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", lead.email))
      .first();
    if (suppression && suppression.reason === "unsubscribed") {
      await ctx.db.delete(suppression._id);
    }
    // Park in paused — Daniel decides whether to resume.
    await ctx.db.patch(enrollment._id, {
      status: "paused",
      pausedReason: "manual",
      pausedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
