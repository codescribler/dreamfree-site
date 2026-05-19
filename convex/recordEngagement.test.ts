/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const EMPTY_ELEMENT = {
  score: 0,
  summary: "",
  analysis: "",
  businessImpact: "",
  recommendations: [],
};

const EMPTY_ELEMENTS = {
  character: EMPTY_ELEMENT,
  problem: EMPTY_ELEMENT,
  guide: EMPTY_ELEMENT,
  plan: EMPTY_ELEMENT,
  cta: EMPTY_ELEMENT,
  stakes: EMPTY_ELEMENT,
  transformation: EMPTY_ELEMENT,
};

async function seedApiLeadAndReport(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const apiKeyId = await ctx.db.insert("apiKeys", {
      name: "test key",
      keyHash: "abc",
      createdAt: Date.now(),
    });
    const leadId = await ctx.db.insert("leads", {
      email: "pat@thing.com",
      firstName: "Pat",
      anonymousIds: [],
      sources: ["api_outbound"],
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      leadType: "outbound",
    });
    const reportId = await ctx.db.insert("signalReports", {
      leadId,
      anonymousId: "",
      url: "https://thing.com",
      customerDescription: "Local plumbers",
      overallScore: 72,
      gruntTest: { pass: true, explanation: "ok" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: "success",
      accessLevel: "verified",
      verifyCode: "",
      verifyToken: "tok",
      createdAt: Date.now(),
      createdViaApiKeyId: apiKeyId,
    });
    return { apiKeyId, leadId, reportId };
  });
}

async function seedInboundLeadAndReport(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const leadId = await ctx.db.insert("leads", {
      email: "jane@example.com",
      firstName: "Jane",
      anonymousIds: ["anon-1"],
      sources: ["signal_score"],
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      leadType: "inbound",
      consentedAt: Date.now(),
    });
    const reportId = await ctx.db.insert("signalReports", {
      leadId,
      anonymousId: "anon-1",
      url: "https://example.com",
      customerDescription: "Anyone",
      overallScore: 60,
      gruntTest: { pass: true, explanation: "ok" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: "success",
      accessLevel: "public",
      verifyCode: "",
      verifyToken: "tok",
      createdAt: Date.now(),
    });
    return { leadId, reportId };
  });
}

describe("signalReports.recordEngagement", () => {
  test("first view stamps firstViewedAt + firstEngagedAt and emits an event", async () => {
    const t = convexTest(schema, modules);
    const { leadId, reportId } = await seedApiLeadAndReport(t);

    await t.mutation(api.signalReports.recordEngagement, { reportId });

    const report = await t.run((ctx) => ctx.db.get(reportId));
    expect(report?.firstViewedAt).toBeTypeOf("number");
    expect(report?.viewCount).toBe(1);

    const lead = await t.run((ctx) => ctx.db.get(leadId));
    expect(lead?.firstEngagedAt).toBeTypeOf("number");
    expect(lead?.lastEngagedAt).toBeTypeOf("number");
    expect(lead?.engagementCount).toBe(1);

    const events = await t.run((ctx) =>
      ctx.db
        .query("events")
        .withIndex("by_leadId", (q) => q.eq("leadId", leadId as Id<"leads">))
        .collect(),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("outbound_report_viewed");
    expect(events[0].properties).toMatchObject({ reportId, viewCount: 1 });
  });

  test("repeat view increments counters but does not change firstViewedAt", async () => {
    const t = convexTest(schema, modules);
    const { leadId, reportId } = await seedApiLeadAndReport(t);

    await t.mutation(api.signalReports.recordEngagement, { reportId });
    const reportAfterFirst = await t.run((ctx) => ctx.db.get(reportId));
    const firstViewedAt = reportAfterFirst?.firstViewedAt;
    const leadAfterFirst = await t.run((ctx) => ctx.db.get(leadId));
    const firstEngagedAt = leadAfterFirst?.firstEngagedAt;

    // Tiny delay so lastEngagedAt can differ.
    await new Promise((r) => setTimeout(r, 5));

    await t.mutation(api.signalReports.recordEngagement, { reportId });

    const report = await t.run((ctx) => ctx.db.get(reportId));
    expect(report?.firstViewedAt).toBe(firstViewedAt);
    expect(report?.viewCount).toBe(2);

    const lead = await t.run((ctx) => ctx.db.get(leadId));
    expect(lead?.firstEngagedAt).toBe(firstEngagedAt);
    expect(lead?.engagementCount).toBe(2);
    expect(lead?.lastEngagedAt).toBeGreaterThanOrEqual(firstEngagedAt ?? 0);
  });

  test("is a no-op for inbound reports (no createdViaApiKeyId)", async () => {
    const t = convexTest(schema, modules);
    const { leadId, reportId } = await seedInboundLeadAndReport(t);

    await t.mutation(api.signalReports.recordEngagement, { reportId });

    const report = await t.run((ctx) => ctx.db.get(reportId));
    expect(report?.firstViewedAt).toBeUndefined();
    expect(report?.viewCount).toBeUndefined();

    const lead = await t.run((ctx) => ctx.db.get(leadId));
    expect(lead?.firstEngagedAt).toBeUndefined();
    expect(lead?.engagementCount).toBeUndefined();

    const events = await t.run((ctx) =>
      ctx.db
        .query("events")
        .withIndex("by_leadId", (q) => q.eq("leadId", leadId as Id<"leads">))
        .collect(),
    );
    expect(events).toHaveLength(0);
  });

  test("silently ignores a missing reportId", async () => {
    const t = convexTest(schema, modules);
    // A real Convex id is needed; insert a row, get its id, then delete it.
    const reportId = await t.run(async (ctx) => {
      const leadId = await ctx.db.insert("leads", {
        email: "x@x.com",
        anonymousIds: [],
        sources: [],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
      });
      const id = await ctx.db.insert("signalReports", {
        leadId,
        anonymousId: "",
        url: "",
        customerDescription: "",
        overallScore: 0,
        gruntTest: { pass: false, explanation: "" },
        elements: EMPTY_ELEMENTS,
        quickWin: "",
        strengths: [],
        fullSummary: "",
        status: "success",
        accessLevel: "verified",
        verifyCode: "",
        verifyToken: "",
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

    // Should not throw.
    await t.mutation(api.signalReports.recordEngagement, { reportId });
  });
});
