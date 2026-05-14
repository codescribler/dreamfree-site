/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedEnrollment } from "./emailCampaignsTestSetup";
import { signUnsubscribeToken } from "../lib/email-campaigns/unsubscribe-token";
import { scheduleDraftSend } from "./emailCampaignsSending";

const modules = import.meta.glob("./**/*.ts");

const WEBHOOK_SECRET = "whsec_test_secret";
const UNSUB_SECRET = "unsubscribe-signing-secret-at-least-32ch";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Seed an approved enrollment, mark orientation "sent" with an emailSends row,
 * and put the backstory draft into the "scheduled" state via the real helper.
 */
async function seedWithSentOrientation(t: ReturnType<typeof convexTest>) {
  const seeded = await seedEnrollment(t, { enrollmentStatus: "approved" });
  const resendId = "resend-orientation-1";
  await t.run(async (ctx) => {
    const orientation = (await ctx.db.get(seeded.draftIds[0]))!;
    await ctx.db.patch(orientation._id, {
      status: "sent",
      sentAt: Date.now(),
    });
    await ctx.db.insert("emailSends", {
      enrollmentId: seeded.enrollmentId,
      draftId: orientation._id,
      leadId: seeded.leadId,
      subject: orientation.subject,
      resendId,
      status: "sent",
      sentAt: Date.now(),
    });
    await scheduleDraftSend(ctx, seeded.draftIds[1], Date.now() + 86_400_000);
  });
  return { ...seeded, resendId };
}

describe("recordResendEvent", () => {
  test("rejects a wrong webhook secret", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { resendId } = await seedWithSentOrientation(t);
    await expect(
      t.mutation(api.emailCampaignsInbound.recordResendEvent, {
        webhookSecret: "wrong",
        eventType: "delivered",
        resendId,
        occurredAt: Date.now(),
      }),
    ).rejects.toThrow();
  });

  test("an unknown resendId is a no-op (matched:false), does not throw", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    await seedWithSentOrientation(t);
    const result = await t.mutation(
      api.emailCampaignsInbound.recordResendEvent,
      {
        webhookSecret: WEBHOOK_SECRET,
        eventType: "opened",
        resendId: "resend-does-not-exist",
        occurredAt: Date.now(),
      },
    );
    expect(result).toEqual({ matched: false });
  });

  test("delivered promotes status from sent to delivered", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { resendId } = await seedWithSentOrientation(t);
    await t.mutation(api.emailCampaignsInbound.recordResendEvent, {
      webhookSecret: WEBHOOK_SECRET,
      eventType: "delivered",
      resendId,
      occurredAt: Date.now(),
    });
    const send = await t.run((ctx) =>
      ctx.db
        .query("emailSends")
        .withIndex("by_resendId", (q) => q.eq("resendId", resendId))
        .first(),
    );
    expect(send?.status).toBe("delivered");
  });

  test("opened sets openedAt and does not clobber an existing value", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { resendId } = await seedWithSentOrientation(t);
    const first = Date.UTC(2026, 0, 1, 12, 0);
    await t.mutation(api.emailCampaignsInbound.recordResendEvent, {
      webhookSecret: WEBHOOK_SECRET,
      eventType: "opened",
      resendId,
      occurredAt: first,
    });
    await t.mutation(api.emailCampaignsInbound.recordResendEvent, {
      webhookSecret: WEBHOOK_SECRET,
      eventType: "opened",
      resendId,
      occurredAt: first + 999_999,
    });
    const send = await t.run((ctx) =>
      ctx.db
        .query("emailSends")
        .withIndex("by_resendId", (q) => q.eq("resendId", resendId))
        .first(),
    );
    expect(send?.openedAt).toBe(first);
  });

  test("clicked records clickedAt, clickedUrl and status clicked", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { resendId } = await seedWithSentOrientation(t);
    await t.mutation(api.emailCampaignsInbound.recordResendEvent, {
      webhookSecret: WEBHOOK_SECRET,
      eventType: "clicked",
      resendId,
      occurredAt: Date.now(),
      clickedUrl: "https://dreamfree.co.uk/pricing",
    });
    const send = await t.run((ctx) =>
      ctx.db
        .query("emailSends")
        .withIndex("by_resendId", (q) => q.eq("resendId", resendId))
        .first(),
    );
    expect(send?.status).toBe("clicked");
    expect(send?.clickedUrl).toBe("https://dreamfree.co.uk/pricing");
    expect(send?.clickedAt).toBeGreaterThan(0);
  });

  test("bounced suppresses the email, unsubscribes the enrollment, cancels the next draft", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { resendId, enrollmentId, leadId, draftIds } =
      await seedWithSentOrientation(t);
    await t.mutation(api.emailCampaignsInbound.recordResendEvent, {
      webhookSecret: WEBHOOK_SECRET,
      eventType: "bounced",
      resendId,
      occurredAt: Date.now(),
    });
    const email = await t.run(
      async (ctx) => (await ctx.db.get(leadId))!.email,
    );
    const send = await t.run((ctx) =>
      ctx.db
        .query("emailSends")
        .withIndex("by_resendId", (q) => q.eq("resendId", resendId))
        .first(),
    );
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const backstory = await t.run((ctx) => ctx.db.get(draftIds[1]));
    const suppression = await t.run((ctx) =>
      ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first(),
    );
    expect(send?.status).toBe("bounced");
    expect(enrollment?.status).toBe("unsubscribed");
    expect(backstory?.status).toBe("draft"); // scheduled send cancelled
    expect(suppression?.reason).toBe("bounced");
  });

  test("complained suppresses and unsubscribes", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { resendId, enrollmentId, leadId } =
      await seedWithSentOrientation(t);
    await t.mutation(api.emailCampaignsInbound.recordResendEvent, {
      webhookSecret: WEBHOOK_SECRET,
      eventType: "complained",
      resendId,
      occurredAt: Date.now(),
    });
    const email = await t.run(
      async (ctx) => (await ctx.db.get(leadId))!.email,
    );
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const suppression = await t.run((ctx) =>
      ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first(),
    );
    expect(enrollment?.status).toBe("unsubscribed");
    expect(suppression?.reason).toBe("complained");
  });
});

describe("processUnsubscribe", () => {
  test("a valid token suppresses the email, unsubscribes the enrollment, cancels the next draft", async () => {
    vi.stubEnv("UNSUBSCRIBE_SIGNING_SECRET", UNSUB_SECRET);
    const t = convexTest(schema, modules);
    const { enrollmentId, leadId, draftIds } =
      await seedWithSentOrientation(t);
    const token = await signUnsubscribeToken({
      enrollmentId,
      draftId: draftIds[0],
    });

    const result = await t.mutation(
      api.emailCampaignsInbound.processUnsubscribe,
      { token },
    );

    const email = await t.run(
      async (ctx) => (await ctx.db.get(leadId))!.email,
    );
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const backstory = await t.run((ctx) => ctx.db.get(draftIds[1]));
    const suppression = await t.run((ctx) =>
      ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first(),
    );
    expect(result).toMatchObject({ ok: true, alreadyProcessed: false, email });
    expect(enrollment?.status).toBe("unsubscribed");
    expect(backstory?.status).toBe("draft");
    expect(suppression?.reason).toBe("unsubscribed");
  });

  test("an invalid token returns ok:false and changes nothing", async () => {
    vi.stubEnv("UNSUBSCRIBE_SIGNING_SECRET", UNSUB_SECRET);
    const t = convexTest(schema, modules);
    const { enrollmentId } = await seedWithSentOrientation(t);

    const result = await t.mutation(
      api.emailCampaignsInbound.processUnsubscribe,
      { token: "not-a-real-jwt" },
    );

    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
    expect(enrollment?.status).toBe("approved");
  });

  test("is idempotent — a second call reports alreadyProcessed", async () => {
    vi.stubEnv("UNSUBSCRIBE_SIGNING_SECRET", UNSUB_SECRET);
    const t = convexTest(schema, modules);
    const { enrollmentId, draftIds } = await seedWithSentOrientation(t);
    const token = await signUnsubscribeToken({
      enrollmentId,
      draftId: draftIds[0],
    });

    await t.mutation(api.emailCampaignsInbound.processUnsubscribe, { token });
    const second = await t.mutation(
      api.emailCampaignsInbound.processUnsubscribe,
      { token },
    );
    expect(second).toMatchObject({ ok: true, alreadyProcessed: true });

    const suppressions = await t.run((ctx) =>
      ctx.db.query("emailSuppressions").collect(),
    );
    expect(suppressions).toHaveLength(1); // no duplicate row
  });
});

describe("undoUnsubscribe", () => {
  test("removes the suppression and pauses the enrollment for review", async () => {
    vi.stubEnv("UNSUBSCRIBE_SIGNING_SECRET", UNSUB_SECRET);
    const t = convexTest(schema, modules);
    const { enrollmentId, leadId, draftIds } =
      await seedWithSentOrientation(t);
    const token = await signUnsubscribeToken({
      enrollmentId,
      draftId: draftIds[0],
    });
    await t.mutation(api.emailCampaignsInbound.processUnsubscribe, { token });

    const result = await t.mutation(
      api.emailCampaignsInbound.undoUnsubscribe,
      { token },
    );

    const email = await t.run(
      async (ctx) => (await ctx.db.get(leadId))!.email,
    );
    const enrollment = await t.run((ctx) => ctx.db.get(enrollmentId));
    const suppression = await t.run((ctx) =>
      ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first(),
    );
    expect(result).toEqual({ ok: true });
    expect(enrollment?.status).toBe("paused");
    expect(enrollment?.pausedReason).toBe("manual");
    expect(suppression).toBeNull();
  });

  test("an invalid token returns ok:false", async () => {
    vi.stubEnv("UNSUBSCRIBE_SIGNING_SECRET", UNSUB_SECRET);
    const t = convexTest(schema, modules);
    await seedWithSentOrientation(t);
    const result = await t.mutation(
      api.emailCampaignsInbound.undoUnsubscribe,
      { token: "garbage" },
    );
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });
});
