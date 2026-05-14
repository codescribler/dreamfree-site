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
    emailCampaignsInbound: { undoUnsubscribe: "undoUnsubscribe-ref" },
  },
}));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  mutationMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/email-campaigns/undo-unsubscribe", () => {
  test("forwards the JSON body token to undoUnsubscribe", async () => {
    mutationMock.mockResolvedValue({ ok: true });
    const req = new Request(
      "https://dreamfree.co.uk/api/email-campaigns/undo-unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok-xyz" }),
      },
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith("undoUnsubscribe-ref", {
      token: "tok-xyz",
    });
  });

  test("returns 400 when the body has no token", async () => {
    const req = new Request(
      "https://dreamfree.co.uk/api/email-campaigns/undo-unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(mutationMock).not.toHaveBeenCalled();
  });
});
