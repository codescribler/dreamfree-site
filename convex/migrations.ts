import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * One-shot: stamp every existing lead as inbound + set consentedAt = createdAt.
 * Run once after the schema fields are deployed. Safe to re-run (idempotent —
 * skips leads that already have a leadType).
 *
 * Run with: npx convex run migrations:backfillLeadType '{}'
 */
export const backfillLeadType = internalMutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    let updated = 0;
    let skipped = 0;
    for (const lead of leads) {
      if (lead.leadType !== undefined) {
        skipped += 1;
        continue;
      }
      await ctx.db.patch(lead._id, {
        leadType: "inbound",
        consentedAt: lead.createdAt,
      });
      updated += 1;
    }
    return { total: leads.length, updated, skipped };
  },
});

/**
 * One-shot: pause every active emailEnrollment whose lead has been API-
 * targeted (`sources.includes("api_outbound")`). Cleans up the consent
 * violation caused by the historic `runReportGeneration` bug that promoted
 * API leads to leadType:"inbound" and let them slip past the enrolment
 * consent guard.
 *
 * Active = status in {"generating", "pending_approval", "approved", "paused"}.
 * Sets status to "paused" with pausedReason "manual" and stamps pausedAt.
 * Already-paused enrolments get re-stamped with the new pausedAt; this
 * is idempotent for the practical end state (lead remains paused).
 * Terminal statuses (stopped, completed, unsubscribed) are left alone.
 *
 * Run with: npx convex run migrations:pauseOutboundEnrollments '{}'
 */
export const pauseOutboundEnrollments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const ACTIVE_STATUSES = new Set<Doc<"emailEnrollments">["status"]>([
      "generating",
      "pending_approval",
      "approved",
      "paused",
    ]);

    const enrollments = await ctx.db.query("emailEnrollments").collect();
    let paused = 0;
    let skippedTerminal = 0;
    let skippedConsenting = 0;
    const pausedLeadEmails: string[] = [];

    for (const enrollment of enrollments) {
      if (!ACTIVE_STATUSES.has(enrollment.status)) {
        skippedTerminal += 1;
        continue;
      }
      const lead = await ctx.db.get(enrollment.leadId);
      if (!lead || !lead.sources.includes("api_outbound")) {
        skippedConsenting += 1;
        continue;
      }
      await ctx.db.patch(enrollment._id, {
        status: "paused",
        pausedReason: "manual",
        pausedAt: now,
      });
      paused += 1;
      pausedLeadEmails.push(lead.email);
    }

    return {
      total: enrollments.length,
      paused,
      skippedTerminal,
      skippedConsenting,
      pausedLeadEmails,
    };
  },
});
