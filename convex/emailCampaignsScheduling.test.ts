/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedEnrollment } from "./emailCampaignsTestSetup";

const modules = import.meta.glob("./**/*.ts");

describe("approveEnrollment scheduling", () => {
  test("schedules only the orientation draft, leaves drafts 2-7 as 'draft'", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "pending_approval",
    });

    await t.mutation(api.emailCampaigns.approveEnrollment, { enrollmentId });

    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const drafts = await t.run((ctx) =>
      Promise.all(draftIds.map((id) => ctx.db.get(id))),
    );
    expect(enrollment?.status).toBe("approved");
    expect(enrollment?.approvedAt).toBeGreaterThan(0);
    expect(drafts[0]?.status).toBe("scheduled");
    expect(typeof drafts[0]?.scheduledFunctionId).toBe("string");
    expect(drafts[0]?.scheduledFor).toBeGreaterThan(0);
    for (let i = 1; i < 7; i++) {
      expect(drafts[i]?.status).toBe("draft");
      expect(drafts[i]?.scheduledFunctionId).toBeUndefined();
    }
  });

  test("orientation send time is at least triggerTime + 2min", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "pending_approval",
    });
    const enrolledAt = await t.run(
      async (ctx) => (await ctx.db.get(enrollmentId))!.enrolledAt,
    );

    await t.mutation(api.emailCampaigns.approveEnrollment, { enrollmentId });

    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(orientation?.scheduledFor).toBeGreaterThanOrEqual(
      enrolledAt + 2 * 60_000,
    );
  });

  test("rejects approval from a non-pending_approval status", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await expect(
      t.mutation(api.emailCampaigns.approveEnrollment, { enrollmentId }),
    ).rejects.toThrow();
  });
});

/** Seed → approve, so the orientation draft is in the "scheduled" state. */
async function seedApproved(t: ReturnType<typeof convexTest>) {
  const seeded = await seedEnrollment(t, {
    enrollmentStatus: "pending_approval",
  });
  await t.mutation(api.emailCampaigns.approveEnrollment, {
    enrollmentId: seeded.enrollmentId,
  });
  return seeded;
}

describe("pause / resume / stop / suppress scheduling", () => {
  test("pauseEnrollment cancels the scheduled draft", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedApproved(t);

    await t.mutation(api.emailCampaigns.pauseEnrollment, {
      enrollmentId,
      reason: "manual",
    });

    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(enrollment?.status).toBe("paused");
    expect(orientation?.status).toBe("draft");
    expect(orientation?.scheduledFunctionId).toBeUndefined();
    expect(orientation?.scheduledFor).toBeUndefined();
  });

  test("resumeEnrollment reschedules the next unsent draft", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedApproved(t);
    await t.mutation(api.emailCampaigns.pauseEnrollment, {
      enrollmentId,
      reason: "manual",
    });

    await t.mutation(api.emailCampaigns.resumeEnrollment, { enrollmentId });

    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(enrollment?.status).toBe("approved");
    expect(enrollment?.pausedReason).toBeUndefined();
    expect(orientation?.status).toBe("scheduled");
    expect(typeof orientation?.scheduledFunctionId).toBe("string");
  });

  test("resumeEnrollment reschedules the right draft when one is already sent", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedApproved(t);
    await t.mutation(api.emailCampaigns.pauseEnrollment, {
      enrollmentId,
      reason: "manual",
    });
    // Mark orientation as already sent — resume should pick up backstory.
    await t.run((ctx) =>
      ctx.db.patch(draftIds[0], { status: "sent", sentAt: Date.now() }),
    );

    await t.mutation(api.emailCampaigns.resumeEnrollment, { enrollmentId });

    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const backstory = await t.run((ctx) => ctx.db.get(draftIds[1]));
    expect(orientation?.status).toBe("sent");
    expect(backstory?.status).toBe("scheduled");
  });

  test("stopEnrollment cancels the scheduled draft", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedApproved(t);

    await t.mutation(api.emailCampaigns.stopEnrollment, { enrollmentId });

    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(enrollment?.status).toBe("stopped");
    expect(orientation?.status).toBe("draft");
    expect(orientation?.scheduledFunctionId).toBeUndefined();
  });

  test("suppressEmail cancels the scheduled draft and unsubscribes the enrollment", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds, leadId } = await seedApproved(t);
    const email = await t.run(
      async (ctx) => (await ctx.db.get(leadId))!.email,
    );

    await t.mutation(api.emailCampaigns.suppressEmail, {
      email,
      enrollmentId,
    });

    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const suppression = await t.run((ctx) =>
      ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first(),
    );
    expect(enrollment?.status).toBe("unsubscribed");
    expect(orientation?.status).toBe("draft");
    expect(suppression?.reason).toBe("manual");
  });
});
