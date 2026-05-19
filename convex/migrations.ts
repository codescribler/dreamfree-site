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
 * One-shot: backfill `url`/`email`/`firstName` onto `outbound_report_viewed`
 * event properties for events emitted before the recordEngagement url-
 * denormalisation deploy. Looks up the report via properties.reportId
 * and the lead via event.leadId.
 *
 * Run with: npx convex run migrations:backfillEventUrls '{}'
 */
export const backfillEventUrls = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_type_and_timestamp", (q) =>
        q.eq("type", "outbound_report_viewed"),
      )
      .collect();

    let patched = 0;
    let alreadyHadUrl = 0;
    let noReportProp = 0;
    let reportNotFound = 0;

    for (const event of events) {
      const props = (event.properties ?? {}) as Record<string, unknown>;
      if (typeof props.url === "string" && props.url.length > 0) {
        alreadyHadUrl += 1;
        continue;
      }
      const reportId = props.reportId;
      if (typeof reportId !== "string") {
        noReportProp += 1;
        continue;
      }
      const report = await ctx.db.get(reportId as Doc<"signalReports">["_id"]);
      if (!report) {
        reportNotFound += 1;
        continue;
      }
      const lead = event.leadId ? await ctx.db.get(event.leadId) : null;
      await ctx.db.patch(event._id, {
        properties: {
          ...props,
          url: report.url,
          email: lead?.email ?? null,
          firstName: lead?.firstName ?? null,
        },
      });
      patched += 1;
    }

    return {
      total: events.length,
      patched,
      alreadyHadUrl,
      noReportProp,
      reportNotFound,
    };
  },
});

/**
 * One-shot: backfill engagement on API-sourced leads from unambiguous
 * downstream signals — demo requests, callback requests, and inbound
 * contact-form submissions. Any one of those proves the prospect did
 * something material after receiving their report; we can confidently
 * mark them engaged even though `recordEngagement` didn't capture the
 * original click.
 *
 * For each qualifying lead: stamps `firstEngagedAt` (if unset), bumps
 * `engagementCount`, and patches `firstViewedAt`/`viewCount` on their
 * most-recent API report. Emits a single `outbound_report_viewed` event
 * with `source: "backfill_<signal>"` so the engagement surfaces in
 * Recent Activity with provenance.
 *
 * Skips leads that are already engaged (firstEngagedAt set), so re-runs
 * are no-ops once stamped.
 *
 * Run with: npx convex run migrations:backfillEngagementFromSignals '{}'
 */
export const backfillEngagementFromSignals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demoRequests = await ctx.db.query("demoRequests").collect();
    const callbackRequests = await ctx.db.query("callbackRequests").collect();
    const contactSubmissions = await ctx.db
      .query("formSubmissions")
      .withIndex("by_type", (q) => q.eq("type", "contact_form"))
      .collect();

    // Earliest signal per leadId wins (the engagement event uses that
    // timestamp). Track the signal type for provenance.
    const earliestByLead = new Map<
      string,
      { ts: number; signal: string }
    >();
    const consider = (leadId: string, ts: number, signal: string) => {
      const existing = earliestByLead.get(leadId);
      if (!existing || ts < existing.ts) {
        earliestByLead.set(leadId, { ts, signal });
      }
    };
    for (const r of demoRequests) consider(r.leadId, r.createdAt, "demo_request");
    for (const r of callbackRequests) consider(r.leadId, r.createdAt, "callback_request");
    for (const f of contactSubmissions) {
      if (f.leadId) consider(f.leadId, f.createdAt, "contact_form");
    }

    let stamped = 0;
    let alreadyEngaged = 0;
    let notApiSourced = 0;
    let noReport = 0;
    const stampedSummary: Array<{
      email: string;
      signal: string;
      url: string | null;
    }> = [];

    for (const [leadIdStr, { ts, signal }] of earliestByLead.entries()) {
      const lead = await ctx.db.get(leadIdStr as Doc<"leads">["_id"]);
      if (!lead) continue;
      if (!lead.sources.includes("api_outbound")) {
        notApiSourced += 1;
        continue;
      }
      if (lead.firstEngagedAt != null) {
        alreadyEngaged += 1;
        continue;
      }

      // Find the most-recent API-created report for the lead.
      const reports = await ctx.db
        .query("signalReports")
        .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
        .order("desc")
        .take(20);
      const apiReport = reports.find((r) => r.createdViaApiKeyId != null) ?? null;

      // Without an API report we can't synthesise the report-viewed event,
      // but we can still stamp the lead. Track that separately.
      if (apiReport) {
        const nextViewCount = (apiReport.viewCount ?? 0) + 1;
        await ctx.db.patch(apiReport._id, {
          firstViewedAt: apiReport.firstViewedAt ?? ts,
          viewCount: nextViewCount,
        });
        await ctx.db.insert("events", {
          type: "outbound_report_viewed",
          anonymousId: "",
          leadId: lead._id,
          sessionId: "",
          path: `/report/${apiReport._id}`,
          properties: {
            reportId: apiReport._id,
            viewCount: nextViewCount,
            url: apiReport.url,
            email: lead.email,
            firstName: lead.firstName ?? null,
            source: `backfill_${signal}`,
          },
          timestamp: ts,
        });
        stampedSummary.push({
          email: lead.email,
          signal,
          url: apiReport.url,
        });
      } else {
        noReport += 1;
        stampedSummary.push({ email: lead.email, signal, url: null });
      }

      await ctx.db.patch(lead._id, {
        firstEngagedAt: ts,
        lastEngagedAt: ts,
        engagementCount: (lead.engagementCount ?? 0) + 1,
      });
      stamped += 1;
    }

    return {
      stamped,
      alreadyEngaged,
      notApiSourced,
      noReport,
      stampedSummary,
    };
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
