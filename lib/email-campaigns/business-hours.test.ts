// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clampToBusinessHours, type BusinessHoursConfig } from "./business-hours";

// Mon–Fri, 09:00–18:00 London.
const CONFIG: BusinessHoursConfig = {
  businessHoursEnabled: true,
  businessHoursStartUtcMinutes: 9 * 60,
  businessHoursEndUtcMinutes: 18 * 60,
  businessDays: [1, 2, 3, 4, 5],
};

/** Build a UTC timestamp, then describe the London wall-clock it lands on. */
function londonParts(ts: number) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return f.format(ts);
}

describe("clampToBusinessHours", () => {
  it("returns the timestamp unchanged when business hours are disabled", () => {
    const ts = Date.UTC(2026, 0, 3, 3, 0); // Sat 03:00 — well outside hours
    expect(
      clampToBusinessHours(ts, { ...CONFIG, businessHoursEnabled: false }),
    ).toBe(ts);
  });

  it("returns the timestamp unchanged inside the window on a weekday (GMT)", () => {
    // Wed 14 Jan 2026 11:30 UTC — winter, London == UTC. Inside 09:00–18:00.
    const ts = Date.UTC(2026, 0, 14, 11, 30);
    expect(clampToBusinessHours(ts, CONFIG)).toBe(ts);
  });

  it("returns the timestamp unchanged inside the window on a weekday (BST)", () => {
    // Wed 15 Jul 2026 09:30 UTC == 10:30 London (BST). Inside window.
    const ts = Date.UTC(2026, 6, 15, 9, 30);
    expect(clampToBusinessHours(ts, CONFIG)).toBe(ts);
  });

  it("bumps a before-09:00 weekday time to 09:00 the same day (GMT)", () => {
    // Wed 14 Jan 2026 06:00 UTC == 06:00 London. Bump to 09:00 London == 09:00 UTC.
    const ts = Date.UTC(2026, 0, 14, 6, 0);
    const out = clampToBusinessHours(ts, CONFIG);
    expect(out).toBe(Date.UTC(2026, 0, 14, 9, 0));
  });

  it("bumps an after-18:00 weekday time to 09:00 the next business day (GMT)", () => {
    // Wed 14 Jan 2026 19:00 UTC == 19:00 London. Bump to Thu 09:00 London == 09:00 UTC.
    const ts = Date.UTC(2026, 0, 14, 19, 0);
    const out = clampToBusinessHours(ts, CONFIG);
    expect(out).toBe(Date.UTC(2026, 0, 15, 9, 0));
  });

  it("bumps a before-09:00 weekday time to 09:00 BST (== 08:00 UTC)", () => {
    // Wed 15 Jul 2026 05:00 UTC == 06:00 London BST. Bump to 09:00 London == 08:00 UTC.
    const ts = Date.UTC(2026, 6, 15, 5, 0);
    const out = clampToBusinessHours(ts, CONFIG);
    expect(out).toBe(Date.UTC(2026, 6, 15, 8, 0));
  });

  it("bumps Saturday to Monday 09:00 (GMT)", () => {
    // Sat 17 Jan 2026 12:00 UTC. Next business day Mon 19 Jan 09:00 London == 09:00 UTC.
    const ts = Date.UTC(2026, 0, 17, 12, 0);
    const out = clampToBusinessHours(ts, CONFIG);
    expect(out).toBe(Date.UTC(2026, 0, 19, 9, 0));
  });

  it("bumps Sunday to Monday 09:00 BST (== 08:00 UTC)", () => {
    // Sun 19 Jul 2026 23:00 UTC == Mon 20 Jul 00:00 London. Next window Mon 09:00 == 08:00 UTC.
    const ts = Date.UTC(2026, 6, 19, 23, 0);
    const out = clampToBusinessHours(ts, CONFIG);
    expect(out).toBe(Date.UTC(2026, 6, 20, 8, 0));
  });

  it("bumps Friday-evening to Monday 09:00", () => {
    // Fri 16 Jan 2026 20:00 UTC. Next business day Mon 19 Jan 09:00 == 09:00 UTC.
    const ts = Date.UTC(2026, 0, 16, 20, 0);
    const out = clampToBusinessHours(ts, CONFIG);
    expect(out).toBe(Date.UTC(2026, 0, 19, 9, 0));
  });

  it("treats exactly 18:00 as outside the window (end is exclusive)", () => {
    // Wed 14 Jan 2026 18:00 UTC == 18:00 London. Bump to Thu 09:00.
    const ts = Date.UTC(2026, 0, 14, 18, 0);
    const out = clampToBusinessHours(ts, CONFIG);
    expect(out).toBe(Date.UTC(2026, 0, 15, 9, 0));
    expect(londonParts(out)).toContain("09:00");
  });

  it("treats exactly 09:00 as inside the window (start is inclusive)", () => {
    const ts = Date.UTC(2026, 0, 14, 9, 0); // Wed 09:00 UTC == 09:00 London
    expect(clampToBusinessHours(ts, CONFIG)).toBe(ts);
  });
});
