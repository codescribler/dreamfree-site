/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { seedEnrollment } from "./emailCampaignsTestSetup";
import { sendCampaignEmail } from "../lib/email-campaigns/resend";
import {
  scheduleDraftSend,
  cancelScheduledDraft,
} from "./emailCampaignsSending";

vi.mock("../lib/email-campaigns/resend", () => ({
  sendCampaignEmail: vi.fn(),
}));
const mockSend = vi.mocked(sendCampaignEmail);

const modules = import.meta.glob("./**/*.ts");

async function disableKillSwitch(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const config = await ctx.db.query("campaignConfig").first();
    if (config) await ctx.db.patch(config._id, { globalKillSwitch: false });
  });
}

/** Put a draft into the "scheduled" state without a real scheduled function. */
async function markScheduled(
  t: ReturnType<typeof convexTest>,
  draftId: Id<"emailDrafts">,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(draftId, {
      status: "scheduled",
      scheduledFor: Date.now(),
    });
  });
}

describe("scheduleDraftSend / cancelScheduledDraft helpers", () => {
  test("scheduleDraftSend marks the draft scheduled with a function id", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    const when = Date.now() + 60_000;

    await t.run(async (ctx) => {
      await scheduleDraftSend(ctx, draftIds[0], when);
    });

    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(draft?.status).toBe("scheduled");
    expect(draft?.scheduledFor).toBe(when);
    expect(typeof draft?.scheduledFunctionId).toBe("string");
  });

  test("cancelScheduledDraft resets the scheduled draft back to draft", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await t.run(async (ctx) => {
      await scheduleDraftSend(ctx, draftIds[0], Date.now() + 60_000);
      await cancelScheduledDraft(ctx, enrollmentId);
    });

    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(draft?.status).toBe("draft");
    expect(draft?.scheduledFor).toBeUndefined();
    expect(draft?.scheduledFunctionId).toBeUndefined();
  });
});

describe("applySendSkip", () => {
  test("kind=terminal marks the draft skipped_terminal, enrollment untouched", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "paused",
    });
    await t.mutation(internal.emailCampaignsSending.applySendSkip, {
      draftId: draftIds[0],
      kind: "terminal",
    });
    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    expect(draft?.status).toBe("skipped_terminal");
    expect(enrollment?.status).toBe("paused");
  });

  test("kind=suppressed marks draft skipped_suppressed and enrollment unsubscribed", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await t.mutation(internal.emailCampaignsSending.applySendSkip, {
      draftId: draftIds[0],
      kind: "suppressed",
    });
    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    expect(draft?.status).toBe("skipped_suppressed");
    expect(enrollment?.status).toBe("unsubscribed");
  });

  test("kind=stale_cascade marks draft skipped_terminal and pauses with reason", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await t.mutation(internal.emailCampaignsSending.applySendSkip, {
      draftId: draftIds[0],
      kind: "stale_cascade",
    });
    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    expect(draft?.status).toBe("skipped_terminal");
    expect(enrollment?.status).toBe("paused");
    expect(enrollment?.pausedReason).toBe("stale_cascade");
  });
});

describe("rescheduleDraftForKillSwitch", () => {
  test("pushes scheduledFor ~1h out and keeps status scheduled", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await t.run(async (ctx) => {
      await scheduleDraftSend(ctx, draftIds[0], Date.now() + 60_000);
    });
    const before = Date.now();
    await t.mutation(
      internal.emailCampaignsSending.rescheduleDraftForKillSwitch,
      { draftId: draftIds[0] },
    );
    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(draft?.status).toBe("scheduled");
    expect(draft?.scheduledFor).toBeGreaterThan(before + 59 * 60_000);
  });
});

describe("recordSendAndScheduleNext", () => {
  test("records the send, marks the draft sent, schedules the next draft", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, leadId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await t.mutation(
      internal.emailCampaignsSending.recordSendAndScheduleNext,
      { draftId: draftIds[0], resendId: "resend-1" },
    );

    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const backstory = await t.run((ctx) => ctx.db.get(draftIds[1]));
    const sends = await t.run((ctx) =>
      ctx.db
        .query("emailSends")
        .withIndex("by_enrollmentId", (q) =>
          q.eq("enrollmentId", enrollmentId),
        )
        .collect(),
    );

    expect(orientation?.status).toBe("sent");
    expect(orientation?.sentAt).toBeGreaterThan(0);
    expect(backstory?.status).toBe("scheduled");
    expect(backstory?.scheduledFor).toBeGreaterThan(Date.now());
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({
      draftId: draftIds[0],
      leadId,
      resendId: "resend-1",
      status: "sent",
    });
  });

  test("on the offer draft, completes the enrollment and schedules nothing", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    const offerDraftId = draftIds[6];
    await t.mutation(
      internal.emailCampaignsSending.recordSendAndScheduleNext,
      { draftId: offerDraftId, resendId: "resend-7" },
    );
    const offer = await t.run((ctx) => ctx.db.get(offerDraftId));
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    expect(offer?.status).toBe("sent");
    expect(enrollment?.status).toBe("completed");
    expect(enrollment?.completedAt).toBeGreaterThan(0);
  });
});

describe("getSendContext", () => {
  test("returns draft + enrollment + report + config and computes guard flags", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    const ctx = await t.query(
      internal.emailCampaignsSending.getSendContext,
      { draftId: draftIds[0] },
    );
    expect(ctx).not.toBeNull();
    expect(ctx?.draft._id).toBe(draftIds[0]);
    expect(ctx?.config?.globalKillSwitch).toBe(true); // seeded ON (sending OFF)
    expect(ctx?.isSuppressed).toBe(false);
    expect(ctx?.laterStaleExists).toBe(false);
    expect(ctx?.report?.url).toContain("acme-plumbing");
  });

  test("isSuppressed is true when the lead email is on the suppression list", async () => {
    const t = convexTest(schema, modules);
    const { draftIds, leadId } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await t.run(async (ctx) => {
      const lead = await ctx.db.get(leadId);
      await ctx.db.insert("emailSuppressions", {
        email: lead!.email,
        reason: "manual",
        suppressedAt: Date.now(),
      });
    });
    const ctx = await t.query(
      internal.emailCampaignsSending.getSendContext,
      { draftId: draftIds[0] },
    );
    expect(ctx?.isSuppressed).toBe(true);
  });

  test("laterStaleExists is true when an edited draft has a stale draft after it", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(draftIds[0], { editedByDaniel: true });
      await ctx.db.patch(draftIds[3], { isStale: true });
    });
    const ctx = await t.query(
      internal.emailCampaignsSending.getSendContext,
      { draftId: draftIds[0] },
    );
    expect(ctx?.laterStaleExists).toBe(true);
  });
});

describe("sendDraft action", () => {
  test("guard 0: a draft that is not 'scheduled' is a noop", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await disableKillSwitch(t);
    mockSend.mockResolvedValue({ ok: true, resendId: "should-not-be-used" });

    await t.action(internal.emailCampaignsSending.sendDraft, {
      draftId: draftIds[0],
    });

    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(draft?.status).toBe("draft");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("guard: kill switch ON reschedules ~1h out and does not send", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    // seed leaves globalKillSwitch true (sending OFF) — do NOT disable it here.
    await markScheduled(t, draftIds[0]);
    mockSend.mockResolvedValue({ ok: true, resendId: "nope" });

    const before = Date.now();
    await t.action(internal.emailCampaignsSending.sendDraft, {
      draftId: draftIds[0],
    });

    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(draft?.status).toBe("scheduled");
    expect(draft?.scheduledFor).toBeGreaterThan(before + 59 * 60_000);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("guard: terminal enrollment status skips the draft", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "stopped",
    });
    await disableKillSwitch(t);
    await markScheduled(t, draftIds[0]);
    mockSend.mockResolvedValue({ ok: true, resendId: "nope" });

    await t.action(internal.emailCampaignsSending.sendDraft, {
      draftId: draftIds[0],
    });

    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    expect(draft?.status).toBe("skipped_terminal");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("guard: edited draft with a later stale draft pauses with stale_cascade", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await disableKillSwitch(t);
    await markScheduled(t, draftIds[0]);
    await t.run(async (ctx) => {
      await ctx.db.patch(draftIds[0], { editedByDaniel: true });
      await ctx.db.patch(draftIds[2], { isStale: true });
    });
    mockSend.mockResolvedValue({ ok: true, resendId: "nope" });

    await t.action(internal.emailCampaignsSending.sendDraft, {
      draftId: draftIds[0],
    });

    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    expect(draft?.status).toBe("skipped_terminal");
    expect(enrollment?.status).toBe("paused");
    expect(enrollment?.pausedReason).toBe("stale_cascade");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("guard: a suppressed recipient skips and unsubscribes the enrollment", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, leadId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await disableKillSwitch(t);
    await markScheduled(t, draftIds[0]);
    await t.run(async (ctx) => {
      const lead = await ctx.db.get(leadId);
      await ctx.db.insert("emailSuppressions", {
        email: lead!.email,
        reason: "unsubscribed",
        suppressedAt: Date.now(),
      });
    });
    mockSend.mockResolvedValue({ ok: true, resendId: "nope" });

    await t.action(internal.emailCampaignsSending.sendDraft, {
      draftId: draftIds[0],
    });

    const draft = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    expect(draft?.status).toBe("skipped_suppressed");
    expect(enrollment?.status).toBe("unsubscribed");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("happy path: sends, records the send, schedules the next draft", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await disableKillSwitch(t);
    await markScheduled(t, draftIds[0]);
    mockSend.mockResolvedValue({ ok: true, resendId: "resend-orientation" });

    await t.action(internal.emailCampaignsSending.sendDraft, {
      draftId: draftIds[0],
    });

    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const backstory = await t.run((ctx) => ctx.db.get(draftIds[1]));
    const sends = await t.run((ctx) =>
      ctx.db
        .query("emailSends")
        .withIndex("by_enrollmentId", (q) =>
          q.eq("enrollmentId", enrollmentId),
        )
        .collect(),
    );
    expect(orientation?.status).toBe("sent");
    expect(backstory?.status).toBe("scheduled");
    expect(sends).toHaveLength(1);
    expect(sends[0].resendId).toBe("resend-orientation");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentArgs = mockSend.mock.calls[0][0];
    expect(sentArgs.to).toBe("owner@acme-plumbing.test");
    expect(sentArgs.subject).toBe("Email 1 of 7");
    expect(sentArgs.unsubscribeUrl).toContain("?t=tok-0");
    expect(sentArgs.listUnsubscribePostUrl).toContain(
      "/api/email-campaigns/unsubscribe?t=tok-0",
    );
    expect(sentArgs.tags.role).toBe("orientation");
  });

  test("happy path: sending the offer completes the enrollment", async () => {
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await disableKillSwitch(t);
    await markScheduled(t, draftIds[6]);
    mockSend.mockResolvedValue({ ok: true, resendId: "resend-offer" });

    await t.action(internal.emailCampaignsSending.sendDraft, {
      draftId: draftIds[6],
    });

    const offer = await t.run((ctx) => ctx.db.get(draftIds[6]));
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    expect(offer?.status).toBe("sent");
    expect(enrollment?.status).toBe("completed");
  });

  test("a failed Resend send marks the draft failed and schedules nothing", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, {
      enrollmentStatus: "approved",
    });
    await disableKillSwitch(t);
    await markScheduled(t, draftIds[0]);
    mockSend.mockResolvedValue({ ok: false, error: "Resend HTTP 500" });

    await t.action(internal.emailCampaignsSending.sendDraft, {
      draftId: draftIds[0],
    });

    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const backstory = await t.run((ctx) => ctx.db.get(draftIds[1]));
    expect(orientation?.status).toBe("failed");
    expect(backstory?.status).toBe("draft"); // chain did not advance
  });
});
