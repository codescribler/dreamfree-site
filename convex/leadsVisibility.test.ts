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
