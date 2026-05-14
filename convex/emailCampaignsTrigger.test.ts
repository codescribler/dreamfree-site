/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { seedLeadAndReport } from "./emailCampaignsTestSetup";

const modules = import.meta.glob("./**/*.ts");

describe("tryEnrolFromReport — consent guard", () => {
  test("enrols an inbound lead", async () => {
    const t = convexTest(schema, modules);
    const { reportId, leadId } = await seedLeadAndReport(t, {
      leadType: "inbound",
    });

    const enrollmentId = await t.mutation(
      internal.emailCampaigns.tryEnrolFromReport,
      { reportId },
    );

    expect(enrollmentId).not.toBeNull();
    const enrollment = await t.run((ctx) =>
      ctx.db
        .query("emailEnrollments")
        .withIndex("by_leadId", (q) => q.eq("leadId", leadId))
        .first(),
    );
    expect(enrollment?.status).toBe("generating");
  });

  test("does NOT enrol an outbound (API-created, non-consented) lead", async () => {
    const t = convexTest(schema, modules);
    const { reportId, leadId } = await seedLeadAndReport(t, {
      leadType: "outbound",
    });

    const enrollmentId = await t.mutation(
      internal.emailCampaigns.tryEnrolFromReport,
      { reportId },
    );

    expect(enrollmentId).toBeNull();
    const enrollment = await t.run((ctx) =>
      ctx.db
        .query("emailEnrollments")
        .withIndex("by_leadId", (q) => q.eq("leadId", leadId))
        .first(),
    );
    expect(enrollment).toBeNull();
  });

  test("does NOT enrol a lead with no leadType set", async () => {
    const t = convexTest(schema, modules);
    const { reportId } = await seedLeadAndReport(t);

    const enrollmentId = await t.mutation(
      internal.emailCampaigns.tryEnrolFromReport,
      { reportId },
    );

    expect(enrollmentId).toBeNull();
  });
});
