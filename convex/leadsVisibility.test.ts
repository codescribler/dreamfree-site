/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const inboundId = await ctx.db.insert("leads", {
      email: "in@x.com",
      anonymousIds: [],
      sources: ["signal_score"],
      lastSeenAt: Date.now(),
      createdAt: Date.now() - 30_000,
      leadType: "inbound",
      consentedAt: Date.now() - 30_000,
    });
    const outboundUnengagedId = await ctx.db.insert("leads", {
      email: "outA@x.com",
      anonymousIds: [],
      sources: ["api_outbound"],
      lastSeenAt: Date.now(),
      createdAt: Date.now() - 20_000,
      leadType: "outbound",
    });
    const outboundEngagedId = await ctx.db.insert("leads", {
      email: "outB@x.com",
      anonymousIds: [],
      sources: ["api_outbound"],
      lastSeenAt: Date.now(),
      createdAt: Date.now() - 10_000,
      leadType: "outbound",
      firstEngagedAt: Date.now() - 5_000,
      lastEngagedAt: Date.now() - 5_000,
      engagementCount: 1,
    });
    return { inboundId, outboundUnengagedId, outboundEngagedId };
  });
}

describe("leads.list visibility", () => {
  test("defaults to topLevel — hides unengaged outbound, keeps engaged", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);

    const rows = await t.query(api.leads.list, {});
    const returned = rows.map((r) => r._id);
    expect(returned).toContain(ids.inboundId);
    expect(returned).toContain(ids.outboundEngagedId);
    expect(returned).not.toContain(ids.outboundUnengagedId);
  });

  test("visibility: 'all' returns every lead", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);

    const rows = await t.query(api.leads.list, { visibility: "all" });
    const returned = rows.map((r) => r._id);
    expect(returned).toContain(ids.inboundId);
    expect(returned).toContain(ids.outboundEngagedId);
    expect(returned).toContain(ids.outboundUnengagedId);
  });
});

describe("leads.listOutbound", () => {
  test("returns each outbound lead with their latest API report and key name", async () => {
    const t = convexTest(schema, modules);

    const { engagedLeadId, unengagedLeadId } = await t.run(async (ctx) => {
      const keyA = await ctx.db.insert("apiKeys", {
        name: "campaign-A",
        keyHash: "kA",
        createdAt: Date.now(),
      });
      const engagedLeadId = await ctx.db.insert("leads", {
        email: "engaged@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now() - 10_000,
        leadType: "outbound",
        firstEngagedAt: Date.now() - 5_000,
        lastEngagedAt: Date.now() - 5_000,
        engagementCount: 3,
      });
      const unengagedLeadId = await ctx.db.insert("leads", {
        email: "unengaged@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now() - 2_000,
        leadType: "outbound",
      });
      const EMPTY = {
        score: 0,
        summary: "",
        analysis: "",
        businessImpact: "",
        recommendations: [],
      };
      const ELEMENTS = {
        character: EMPTY,
        problem: EMPTY,
        guide: EMPTY,
        plan: EMPTY,
        cta: EMPTY,
        stakes: EMPTY,
        transformation: EMPTY,
      };
      await ctx.db.insert("signalReports", {
        leadId: engagedLeadId,
        anonymousId: "",
        url: "https://engaged.test",
        customerDescription: "x",
        overallScore: 80,
        gruntTest: { pass: true, explanation: "" },
        elements: ELEMENTS,
        quickWin: "",
        strengths: [],
        fullSummary: "",
        status: "success",
        accessLevel: "verified",
        verifyCode: "",
        verifyToken: "",
        createdAt: Date.now() - 4_000,
        createdViaApiKeyId: keyA,
        firstViewedAt: Date.now() - 5_000,
        viewCount: 3,
      });
      await ctx.db.insert("signalReports", {
        leadId: unengagedLeadId,
        anonymousId: "",
        url: "https://unengaged.test",
        customerDescription: "y",
        overallScore: 55,
        gruntTest: { pass: false, explanation: "" },
        elements: ELEMENTS,
        quickWin: "",
        strengths: [],
        fullSummary: "",
        status: "success",
        accessLevel: "verified",
        verifyCode: "",
        verifyToken: "",
        createdAt: Date.now() - 1_000,
        createdViaApiKeyId: keyA,
      });
      return { engagedLeadId, unengagedLeadId };
    });

    const rows = await t.query(api.leads.listOutbound, { filter: "all" });
    expect(rows).toHaveLength(2);

    // Engaged sorts first (firstEngagedAt desc nulls last).
    expect(rows[0].lead._id).toBe(engagedLeadId);
    expect(rows[0].report?.url).toBe("https://engaged.test");
    expect(rows[0].report?.viewCount).toBe(3);
    expect(rows[0].apiKeyName).toBe("campaign-A");

    expect(rows[1].lead._id).toBe(unengagedLeadId);
    expect(rows[1].report?.viewCount ?? 0).toBe(0);
  });

  test("filter: 'engaged' / 'pending' narrows correctly", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("leads", {
        email: "eng@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
        firstEngagedAt: Date.now(),
      });
      await ctx.db.insert("leads", {
        email: "pen@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
      });
    });

    const engaged = await t.query(api.leads.listOutbound, { filter: "engaged" });
    expect(engaged.map((r) => r.lead.email)).toEqual(["eng@x.com"]);

    const pending = await t.query(api.leads.listOutbound, { filter: "pending" });
    expect(pending.map((r) => r.lead.email)).toEqual(["pen@x.com"]);
  });
});

describe("leads.countOutbound", () => {
  test("counts all outbound leads regardless of engagement", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("leads", {
        email: "a@x.com",
        anonymousIds: [],
        sources: ["signal_score"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "inbound",
      });
      await ctx.db.insert("leads", {
        email: "b@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
      });
      await ctx.db.insert("leads", {
        email: "c@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
        firstEngagedAt: Date.now(),
      });
    });

    const n = await t.query(api.leads.countOutbound, {});
    expect(n).toBe(2);
  });
});
