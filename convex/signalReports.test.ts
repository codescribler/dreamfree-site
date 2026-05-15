/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Tiny helper — minimal lead + minimal pending report row, returns ids. */
async function seedLeadAndPendingReport(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const leadId = await ctx.db.insert("leads", {
      email: "owner@acme.test",
      firstName: "Sam",
      anonymousIds: ["anon-1"],
      sources: ["signal_score"],
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      leadType: "inbound",
    });
    const element = {
      score: 0,
      summary: "",
      analysis: "",
      businessImpact: "",
      recommendations: [],
    };
    const reportId = await ctx.db.insert("signalReports", {
      leadId,
      anonymousId: "anon-1",
      url: "https://acme.test",
      customerDescription: "Plumbers in N London",
      overallScore: 0,
      gruntTest: { pass: false, explanation: "" },
      elements: {
        character: element,
        problem: element,
        guide: element,
        plan: element,
        cta: element,
        stakes: element,
        transformation: element,
      },
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: "pending",
      accessLevel: "public",
      verifyCode: "",
      verifyToken: "",
      createdAt: Date.now(),
    });
    return { leadId, reportId };
  });
}

/** Find a scheduled function targeting `internal.emails.sendReportFailureNotification`. */
async function findScheduledNotification(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const scheduled = await ctx.db.system
      .query("_scheduled_functions")
      .collect();
    return scheduled.find((s) =>
      s.name.includes("emails") && s.name.includes("sendReportFailureNotification"),
    );
  });
}

describe("failReport notification", () => {
  test("schedules an admin notification with the correct payload", async () => {
    const t = convexTest(schema, modules);
    const { leadId, reportId } = await seedLeadAndPendingReport(t);

    await t.mutation(internal.signalReports.failReport, {
      reportId,
      status: "llm_failed",
      error: "primary=timeout; fallback=timeout",
    });

    // Status was updated
    const report = await t.run((ctx) => ctx.db.get(reportId));
    expect(report?.status).toBe("llm_failed");

    // Notification scheduled
    const scheduled = await findScheduledNotification(t);
    expect(scheduled).toBeDefined();
    const args = scheduled!.args[0] as Record<string, unknown>;
    expect(args.status).toBe("llm_failed");
    expect(args.leadEmail).toBe("owner@acme.test");
    expect(args.leadFirstName).toBe("Sam");
    expect(args.url).toBe("https://acme.test");
    expect(args.customerDescription).toBe("Plumbers in N London");
    expect(args.error).toContain("primary=timeout");
    expect(args.reportId).toBe(reportId);
    expect(args.leadId).toBe(leadId);
  });
});

describe("saveFailedReport notification", () => {
  test("fetch_failed schedules an admin notification", async () => {
    const t = convexTest(schema, modules);
    const { leadId } = await seedLeadAndPendingReport(t);

    await t.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId: "anon-1",
      url: "https://broken.test",
      customerDescription: "Local plumber",
      status: "fetch_failed",
      error: "ENOTFOUND broken.test",
    });

    const scheduled = await findScheduledNotification(t);
    expect(scheduled).toBeDefined();
    const args = scheduled!.args[0] as Record<string, unknown>;
    expect(args.status).toBe("fetch_failed");
    expect(args.url).toBe("https://broken.test");
    expect(args.error).toContain("ENOTFOUND");
  });

  test("rate_limited does NOT schedule a notification (expected behaviour)", async () => {
    const t = convexTest(schema, modules);
    const { leadId } = await seedLeadAndPendingReport(t);

    await t.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId: "anon-1",
      url: "https://acme.test",
      customerDescription: "Plumber",
      status: "rate_limited",
    });

    const scheduled = await findScheduledNotification(t);
    expect(scheduled).toBeFalsy();
  });
});
