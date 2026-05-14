// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { mutationMock } = vi.hoisted(() => ({ mutationMock: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi
    .fn()
    .mockImplementation(() => ({ mutation: mutationMock })),
}));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    emailCampaignsInbound: { processUnsubscribe: "processUnsubscribe-ref" },
  },
}));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  mutationMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/email-campaigns/unsubscribe (one-click)", () => {
  test("forwards the ?t= token to processUnsubscribe and returns 200", async () => {
    mutationMock.mockResolvedValue({
      ok: true,
      alreadyProcessed: false,
      email: "a@b.c",
    });
    const req = new Request(
      "https://dreamfree.co.uk/api/email-campaigns/unsubscribe?t=tok-abc",
      { method: "POST", body: "List-Unsubscribe=One-Click" },
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith("processUnsubscribe-ref", {
      token: "tok-abc",
    });
  });

  test("returns 400 when no token is present", async () => {
    const req = new Request(
      "https://dreamfree.co.uk/api/email-campaigns/unsubscribe",
      { method: "POST", body: "" },
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(mutationMock).not.toHaveBeenCalled();
  });
});
