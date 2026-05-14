// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildUnsubscribeFooterHtml,
  buildUnsubscribeFooterText,
  sendCampaignEmail,
} from "./resend";

const noSleep = async () => {};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildUnsubscribeFooterHtml", () => {
  it("includes the report URL and unsubscribe URL", () => {
    const html = buildUnsubscribeFooterHtml(
      "https://acme.test",
      "https://dreamfree.co.uk/unsubscribe?t=tok123",
    );
    expect(html).toContain("https://acme.test");
    expect(html).toContain("https://dreamfree.co.uk/unsubscribe?t=tok123");
    expect(html).toContain("Unsubscribe");
  });
});

describe("buildUnsubscribeFooterText", () => {
  it("includes both URLs in plain text", () => {
    const text = buildUnsubscribeFooterText(
      "https://acme.test",
      "https://dreamfree.co.uk/unsubscribe?t=tok123",
    );
    expect(text).toContain("https://acme.test");
    expect(text).toContain("https://dreamfree.co.uk/unsubscribe?t=tok123");
  });
});

describe("sendCampaignEmail", () => {
  const baseArgs = {
    from: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
    to: "owner@acme.test",
    subject: "Email 1 of 7",
    bodyHtml: "<p>Hello</p>",
    bodyText: "Hello",
    reportUrl: "https://acme.test",
    unsubscribeUrl: "https://dreamfree.co.uk/unsubscribe?t=tok123",
    listUnsubscribePostUrl:
      "https://dreamfree.co.uk/api/email-campaigns/unsubscribe?t=tok123",
    tags: { enrollmentId: "enr1", draftId: "drf1", role: "orientation" },
  };

  it("returns ok with the resend id on a 200 first try", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "resend-abc" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendCampaignEmail(baseArgs, noSleep);

    expect(result).toEqual({ ok: true, resendId: "resend-abc" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.from).toBe(baseArgs.from);
    expect(body.to).toBe(baseArgs.to);
    expect(body.html).toContain("<p>Hello</p>");
    expect(body.html).toContain(baseArgs.unsubscribeUrl);
    expect(body.text).toContain("Hello");
    expect(body.headers["List-Unsubscribe"]).toBe(
      `<${baseArgs.listUnsubscribePostUrl}>`,
    );
    expect(body.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(body.tags).toEqual([
      { name: "enrollmentId", value: "enr1" },
      { name: "draftId", value: "drf1" },
      { name: "role", value: "orientation" },
    ]);
  });

  it("retries on a 500 and succeeds on the second attempt", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream error", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "resend-xyz" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendCampaignEmail(baseArgs, noSleep);

    expect(result).toEqual({ ok: true, resendId: "resend-xyz" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 failed attempts and returns ok:false", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendCampaignEmail(baseArgs, noSleep);

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    if (!result.ok) expect(result.error).toContain("500");
  });

  it("returns ok:false without calling fetch when the API key is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendCampaignEmail(baseArgs, noSleep);

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
