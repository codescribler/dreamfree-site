/**
 * Shared fixtures for email-campaigns convex-test files. Not a Convex module —
 * exports plain async helpers that take the convex-test handle.
 */
import type { TestConvex } from "convex-test";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ROLES } from "../lib/email-campaigns/roles";

type T = TestConvex<typeof schema>;

/** A complete, minimal-but-valid signalReports document body. */
function makeReportFields(leadId: Id<"leads">) {
  const element = {
    score: 6,
    summary: "s",
    analysis: "a",
    businessImpact: "b",
    recommendations: ["r"],
  };
  return {
    leadId,
    anonymousId: "anon-1",
    url: "https://acme-plumbing.test",
    customerDescription: "Homeowners needing emergency plumbing",
    overallScore: 62,
    gruntTest: { pass: true, explanation: "clear enough" },
    elements: {
      character: element,
      problem: element,
      guide: element,
      plan: element,
      cta: element,
      stakes: element,
      transformation: element,
    },
    quickWin: "Add a phone number to the header",
    strengths: ["fast site"],
    fullSummary: "Decent site, weak CTA.",
    status: "success" as const,
    accessLevel: "verified" as const,
    verifyCode: "123456",
    verifyToken: "vtok",
    createdAt: Date.now(),
  };
}

export interface SeededEnrollment {
  sequenceId: Id<"emailSequences">;
  leadId: Id<"leads">;
  reportId: Id<"signalReports">;
  enrollmentId: Id<"emailEnrollments">;
  /** Draft ids in role order, index 0..6. */
  draftIds: Id<"emailDrafts">[];
}

/**
 * Seeds config + sequence + briefs + voice, then creates a lead, a successful
 * report, an enrollment, and 7 drafts (all status "draft"). The enrollment
 * status is whatever the caller passes (default "pending_approval").
 */
export async function seedEnrollment(
  t: T,
  opts: {
    enrollmentStatus?:
      | "pending_approval"
      | "approved"
      | "paused"
      | "stopped"
      | "unsubscribed"
      | "completed";
    leadEmail?: string;
  } = {},
): Promise<SeededEnrollment> {
  await t.mutation(internal.emailCampaigns.seed, {});
  const enrollmentStatus = opts.enrollmentStatus ?? "pending_approval";
  const leadEmail = opts.leadEmail ?? "owner@acme-plumbing.test";

  return await t.run(async (ctx) => {
    const sequence = await ctx.db.query("emailSequences").first();
    if (!sequence) throw new Error("seed did not create a sequence");

    const leadId = await ctx.db.insert("leads", {
      email: leadEmail,
      firstName: "Sam",
      anonymousIds: ["anon-1"],
      sources: ["signal_score"],
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    });

    const reportId = await ctx.db.insert(
      "signalReports",
      makeReportFields(leadId),
    );

    const enrollmentId = await ctx.db.insert("emailEnrollments", {
      leadId,
      sequenceId: sequence._id,
      reportId,
      status: enrollmentStatus,
      voiceVersionUsed: 1,
      loopLedger: [],
      enrolledAt: Date.now(),
    });

    const draftIds: Id<"emailDrafts">[] = [];
    for (let i = 0; i < ROLES.length; i++) {
      const draftId = await ctx.db.insert("emailDrafts", {
        enrollmentId,
        role: ROLES[i],
        order: i,
        subject: `Email ${i + 1} of 7`,
        bodyHtml: `<p>Body ${i}</p>`,
        bodyText: `Body ${i}`,
        status: "draft",
        briefVersionUsed: 1,
        voiceVersionUsed: 1,
        loopsOpenedHere: [],
        loopsClosedHere: [],
        reportFindingsUsed: [],
        isStale: false,
        editedByDaniel: false,
        unsubscribeToken: `tok-${i}`,
      });
      draftIds.push(draftId);
    }

    return {
      sequenceId: sequence._id,
      leadId,
      reportId,
      enrollmentId,
      draftIds,
    };
  });
}

/**
 * Seeds config + sequence + briefs + voice, then creates a lead (with the
 * given leadType) and a successful report — but NO enrollment. For testing
 * the `tryEnrolFromReport` trigger from a clean slate.
 */
export async function seedLeadAndReport(
  t: T,
  opts: { leadType?: "inbound" | "outbound" } = {},
): Promise<{ leadId: Id<"leads">; reportId: Id<"signalReports"> }> {
  await t.mutation(internal.emailCampaigns.seed, {});
  return await t.run(async (ctx) => {
    const leadId = await ctx.db.insert("leads", {
      email: `lead-${opts.leadType ?? "unset"}@test.com`,
      firstName: "Sam",
      anonymousIds: ["anon-1"],
      sources: ["signal_score"],
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      ...(opts.leadType ? { leadType: opts.leadType } : {}),
    });
    const reportId = await ctx.db.insert(
      "signalReports",
      makeReportFields(leadId),
    );
    return { leadId, reportId };
  });
}
