// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mocks must be created with vi.hoisted so they exist when the hoisted
// vi.mock factories below run.
const { verifyMock, mutationMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  mutationMock: vi.fn(),
}));

// Mock svix so we control signature verification.
vi.mock("svix", () => ({
  Webhook: vi.fn().mockImplementation(() => ({ verify: verifyMock })),
}));

// Mock the Convex client so no network call happens.
vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({
    mutation: mutationMock,
  })),
}));

// The route imports the generated api object — stub it to a plain shape.
vi.mock("@/convex/_generated/api", () => ({
  api: {
    emailCampaignsInbound: { recordResendEvent: "recordResendEvent-ref" },
  },
}));

import { POST } from "./route";

function makeRequest(body: string) {
  return new Request(
    "https://dreamfree.co.uk/api/email-campaigns/resend-webhook",
    {
      method: "POST",
      body,
      headers: {
        "svix-id": "msg_1",
        "svix-timestamp": "1700000000",
        "svix-signature": "v1,sig",
      },
    },
  );
}

beforeEach(() => {
  vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", "whsec_test");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  verifyMock.mockReset();
  mutationMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/email-campaigns/resend-webhook", () => {
  test("forwards a delivered event to recordResendEvent", async () => {
    verifyMock.mockReturnValue({
      type: "email.delivered",
      created_at: "2026-01-02T10:00:00.000Z",
      data: { email_id: "resend-123" },
    });
    const res = await POST(makeRequest("{}") as never);
    expect(res.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith("recordResendEvent-ref", {
      webhookSecret: "whsec_test",
      eventType: "delivered",
      resendId: "resend-123",
      occurredAt: Date.parse("2026-01-02T10:00:00.000Z"),
      clickedUrl: undefined,
    });
  });

  test("extracts the clicked link for a clicked event", async () => {
    verifyMock.mockReturnValue({
      type: "email.clicked",
      created_at: "2026-01-02T10:05:00.000Z",
      data: {
        email_id: "resend-456",
        click: { link: "https://dreamfree.co.uk/pricing" },
      },
    });
    await POST(makeRequest("{}") as never);
    expect(mutationMock).toHaveBeenCalledWith(
      "recordResendEvent-ref",
      expect.objectContaining({
        eventType: "clicked",
        resendId: "resend-456",
        clickedUrl: "https://dreamfree.co.uk/pricing",
      }),
    );
  });

  test("acks but ignores event types we don't act on", async () => {
    verifyMock.mockReturnValue({
      type: "email.sent",
      created_at: "2026-01-02T10:00:00.000Z",
      data: { email_id: "resend-789" },
    });
    const res = await POST(makeRequest("{}") as never);
    expect(res.status).toBe(200);
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("returns 400 when signature verification throws", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(makeRequest("{}") as never);
    expect(res.status).toBe(400);
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("returns 500 when the signing secret is not configured", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SIGNING_SECRET", "");
    const res = await POST(makeRequest("{}") as never);
    expect(res.status).toBe(500);
  });
});
