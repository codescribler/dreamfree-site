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
const ELEMENTS = {
  character: EMPTY_ELEMENT,
  problem: EMPTY_ELEMENT,
  guide: EMPTY_ELEMENT,
  plan: EMPTY_ELEMENT,
  cta: EMPTY_ELEMENT,
  stakes: EMPTY_ELEMENT,
  transformation: EMPTY_ELEMENT,
};

describe("missionControl.getActivity filtering", () => {
  test("hides unengaged outbound leads + unviewed API reports; keeps engaged ones", async () => {
    const t = convexTest(schema, modules);

    const { inboundLeadId, engagedLeadId, unengagedLeadId, viewedReportId, unviewedReportId } =
      await t.run(async (ctx) => {
        const keyId = await ctx.db.insert("apiKeys", {
          name: "k",
          keyHash: "k",
          createdAt: Date.now(),
        });
        const inboundLeadId = await ctx.db.insert("leads", {
          email: "in@x.com",
          anonymousIds: [],
          sources: ["signal_score"],
          lastSeenAt: Date.now(),
          createdAt: Date.now(),
          leadType: "inbound",
        });
        const engagedLeadId = await ctx.db.insert("leads", {
          email: "eng@x.com",
          anonymousIds: [],
          sources: ["api_outbound"],
          lastSeenAt: Date.now(),
          createdAt: Date.now(),
          leadType: "outbound",
          firstEngagedAt: Date.now(),
          engagementCount: 1,
        });
        const unengagedLeadId = await ctx.db.insert("leads", {
          email: "un@x.com",
          anonymousIds: [],
          sources: ["api_outbound"],
          lastSeenAt: Date.now(),
          createdAt: Date.now(),
          leadType: "outbound",
        });
        const baseReport = {
          anonymousId: "",
          url: "https://x",
          customerDescription: "",
          overallScore: 0,
          gruntTest: { pass: false, explanation: "" },
          elements: ELEMENTS,
          quickWin: "",
          strengths: [],
          fullSummary: "",
          status: "success" as const,
          accessLevel: "verified" as const,
          verifyCode: "",
          verifyToken: "",
          createdAt: Date.now(),
          createdViaApiKeyId: keyId,
        };
        const viewedReportId = await ctx.db.insert("signalReports", {
          ...baseReport,
          leadId: engagedLeadId,
          firstViewedAt: Date.now(),
          viewCount: 1,
        });
        const unviewedReportId = await ctx.db.insert("signalReports", {
          ...baseReport,
          leadId: unengagedLeadId,
        });
        return {
          inboundLeadId,
          engagedLeadId,
          unengagedLeadId,
          viewedReportId,
          unviewedReportId,
        };
      });

    const since = Date.now() - 60_000;
    const until = Date.now() + 60_000;
    const result = await t.query(api.missionControl.getActivity, { since, until });

    const leadIds = result.leads.map((l) => l._id);
    expect(leadIds).toContain(inboundLeadId);
    expect(leadIds).toContain(engagedLeadId);
    expect(leadIds).not.toContain(unengagedLeadId);

    const reportIds = result.signalReports.map((r) => r._id);
    expect(reportIds).toContain(viewedReportId);
    expect(reportIds).not.toContain(unviewedReportId);

    expect(result.counts.leads).toBe(result.leads.length);
    expect(result.counts.signalReports).toBe(result.signalReports.length);

    expect(result.leadsReferenced[inboundLeadId]).toBeDefined();
    expect(result.leadsReferenced[engagedLeadId]).toBeDefined();
    expect(result.leadsReferenced[unengagedLeadId as Id<"leads">]).toBeUndefined();
  });

  test("keeps outbound_report_viewed events in the events array", async () => {
    const t = convexTest(schema, modules);
    const { engagedLeadId } = await t.run(async (ctx) => {
      const engagedLeadId = await ctx.db.insert("leads", {
        email: "eng@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
        firstEngagedAt: Date.now(),
      });
      await ctx.db.insert("events", {
        type: "outbound_report_viewed",
        anonymousId: "",
        leadId: engagedLeadId,
        sessionId: "",
        path: "/report/x",
        properties: {},
        timestamp: Date.now(),
      });
      return { engagedLeadId };
    });

    const since = Date.now() - 60_000;
    const until = Date.now() + 60_000;
    const result = await t.query(api.missionControl.getActivity, { since, until });

    const types = result.events.map((e) => e.type);
    expect(types).toContain("outbound_report_viewed");
    expect(result.leadsReferenced[engagedLeadId]).toBeDefined();
  });
});
