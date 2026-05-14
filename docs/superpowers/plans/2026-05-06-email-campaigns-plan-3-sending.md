# Email Campaigns — Plan 3: Sending, Scheduler, Webhooks & Unsubscribe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the email-campaigns system actually send — wire approval to a reactive scheduler, send drafts through Resend, handle delivery/open/click/bounce webhooks, and give recipients a working one-click unsubscribe.

**Architecture:** A single `sendDraft` Convex internal action is the send chokepoint: it runs five ordered guards (kill switch → terminal status → stale-cascade → suppression → send) and, on a successful send, schedules the next draft reactively. `approveEnrollment` schedules only the orientation email; every later email is scheduled by the previous one once it sends. Business-hours clamping is a pure function in `lib/`. The Resend webhook and the public `/unsubscribe` page are thin Next.js handlers that verify their secret/token and forward to Convex mutations.

**Tech Stack:** Convex (actions, mutations, `ctx.scheduler`), Next.js App Router route handlers + server component, Resend HTTP API, `svix` for webhook signature verification, `jose` for unsubscribe-token verification (already used in Plan 1), `vitest` + `convex-test` + `@edge-runtime/vm` for tests (new — no test infra exists yet).

**Spec:** `docs/superpowers/specs/2026-05-06-personalised-email-campaigns-design.md` — sections "Scheduler & sending", "Unsubscribe & suppression", "Configuration / env", "Testing strategy".

**Prerequisite state (already shipped by Plans 1 & 2, on `master`):**
- Schema: `campaignConfig`, `emailVoiceSpec`, `emailSequences`, `emailRoleBriefs`, `emailEnrollments`, `emailDrafts`, `emailSends`, `emailSuppressions` — all final, **no schema changes in this plan**.
- `convex/emailCampaigns.ts` — config/enrollment mutations. `approveEnrollment`, `pauseEnrollment`, `resumeEnrollment`, `stopEnrollment`, `suppressEmail` exist but contain `// NB: ... happens in Plan 3` stubs where scheduling belongs.
- `convex/emailCampaignsAction.ts` — `generateSequence`, `verifySequence`, `regenerateFromRole`.
- `lib/email-campaigns/` — `roles.ts` (`ROLES`, `DEFAULT_ROLE_GAPS_MS`, `Role`), `unsubscribe-token.ts` (`signUnsubscribeToken`, `verifyUnsubscribeToken`).
- Admin UI under `app/dashboard/email-campaigns/` — already reads `emailDrafts.status`/`scheduledFor`, so it lights up automatically once this plan writes those fields.

**Design decisions locked for this plan (engineer: do not re-litigate):**
1. **Webhook stays a Next.js route** (per spec). `svix` verification runs in the Next.js Node runtime. The Convex `recordResendEvent` mutation is public, so it additionally checks a shared secret (`RESEND_WEBHOOK_SIGNING_SECRET`, set in **both** Vercel and Convex env) — belt-and-braces against direct calls.
2. **Unsubscribe Convex mutations are public and self-verify the JWT** via `verifyUnsubscribeToken` (jose runs fine in the Convex default runtime — it uses Web Crypto). No internal-action wrapper needed.
3. **One-click `List-Unsubscribe` POST** needs a POST endpoint; an App Router `page.tsx` cannot also be a `route.ts`. So: the visible footer link points at the `/unsubscribe` **page** (GET, nice UI); the `List-Unsubscribe` **header** points at `/api/email-campaigns/unsubscribe` **route** (POST, one-click, 200 empty). Minor, justified deviation from the spec's "same URL".
4. **Resend send retries live in `lib/email-campaigns/resend.ts`** (`sendCampaignEmail`, up to 3 attempts, injectable `sleep` for tests). The `sendDraft` action calls it once and reacts to the final result — no retry logic in the action.
5. **`sendDraft` guard tests mock the resend lib** (`vi.mock`) so they run instantly; the real retry/backoff is tested separately in `resend.test.ts` with an injected sleep.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `vitest.config.ts` | Vitest config — `edge-runtime` default environment, loads `import.meta.glob` modules for convex-test. |
| `lib/email-campaigns/business-hours.ts` | Pure `clampToBusinessHours(ts, config)` + `isWithinBusinessHours` + London-timezone helpers. No Convex imports. |
| `lib/email-campaigns/business-hours.test.ts` | Unit tests — GMT, BST, weekends, out-of-hours, disabled. `// @vitest-environment node`. |
| `lib/email-campaigns/resend.ts` | `sendCampaignEmail` (Resend HTTP wrapper, retry+backoff, `List-Unsubscribe` headers, tags), `buildUnsubscribeFooterHtml`, `buildUnsubscribeFooterText`. No Convex imports. |
| `lib/email-campaigns/resend.test.ts` | Unit tests — retry logic with injected sleep, footer builders, header shape. `// @vitest-environment node`. |
| `convex/emailCampaignsSending.ts` | `sendDraft` internal action + its internal query/mutations (`getSendContext`, `applySendSkip`, `rescheduleDraftForKillSwitch`, `recordSendAndScheduleNext`, `markDraftFailed`) + exported helpers `scheduleDraftSend`, `cancelScheduledDraft`. |
| `convex/emailCampaignsSending.test.ts` | convex-test — the five `sendDraft` guards, success+chain, offer→completed, failure→failed. |
| `convex/emailCampaignsScheduling.test.ts` | convex-test — `approveEnrollment` schedules orientation only; pause cancels; resume reschedules; stop & suppress cancel. |
| `convex/emailCampaignsInbound.ts` | Public mutations `recordResendEvent`, `processUnsubscribe`, `undoUnsubscribe`. |
| `convex/emailCampaignsInbound.test.ts` | convex-test — webhook events (delivered/opened/clicked/bounced/complained), unsubscribe valid/invalid/idempotent, undo. |
| `app/api/email-campaigns/resend-webhook/route.ts` | POST — svix-verify, parse Resend event, forward to `recordResendEvent`. |
| `app/api/email-campaigns/unsubscribe/route.ts` | POST — one-click `List-Unsubscribe` target; forwards token to `processUnsubscribe`; returns 200. |
| `app/api/email-campaigns/undo-unsubscribe/route.ts` | POST — "I unsubscribed by accident" target; forwards token to `undoUnsubscribe`. |
| `app/unsubscribe/page.tsx` | Public GET page — verifies token, calls `processUnsubscribe`, renders confirmation or error. |
| `app/unsubscribe/UndoUnsubscribeButton.tsx` | Client component — POSTs to `/api/email-campaigns/undo-unsubscribe`. |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add devDeps `vitest`, `convex-test`, `@edge-runtime/vm`; add dep `svix`; add `"test": "vitest run"` and `"test:watch": "vitest"` scripts. |
| `convex/emailCampaigns.ts` | `approveEnrollment` schedules orientation; `pauseEnrollment`/`stopEnrollment`/`suppressEmail` cancel the scheduled draft; `resumeEnrollment` reschedules the next unsent draft. Imports helpers from `./emailCampaignsSending`. |
| `convex/_generated/**` | Regenerated by `npx convex dev`/`codegen` after new functions land (Task 12). |

**Import-cycle note:** `emailCampaignsSending.ts` never imports from `emailCampaigns.ts`. `emailCampaigns.ts` imports only the two plain helper functions from `emailCampaignsSending.ts`. Both import the pure clamp from `lib/`.

---

## Task 1: Test harness setup

No test infrastructure exists. This task adds it and proves it runs.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `convex/smoke.test.ts` (temporary — deleted at end of task)

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install -D vitest convex-test @edge-runtime/vm
npm install svix
```
Expected: `package.json` gains `vitest`, `convex-test`, `@edge-runtime/vm` under `devDependencies` and `svix` under `dependencies`. `npm install` exits 0.

- [ ] **Step 2: Add test scripts to package.json**

In `package.json`, add to the `"scripts"` object (after `"format:check"`):
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

Create `vitest.config.ts` (the `@` alias mirrors `tsconfig.json` so Next.js route tests in Task 10–11 can `import "@/convex/_generated/api"`):
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
```

- [ ] **Step 4: Create a smoke test**

Create `convex/smoke.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("convex-test harness boots and seeds", async () => {
  const t = convexTest(schema, modules);
  const before = await t.run(async (ctx) => ctx.db.query("campaignConfig").first());
  expect(before).toBeNull();
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test -- convex/smoke.test.ts`
Expected: PASS, 1 test. If it fails on `import.meta.glob` types, confirm the `/// <reference types="vite/client" />` line is present.

- [ ] **Step 6: Delete the smoke test**

Run: `rm convex/smoke.test.ts`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(email-campaigns): add vitest + convex-test harness and svix dep"
```

---

## Task 2: Business-hours clamp (pure)

`clampToBusinessHours` decides when a send is allowed. Pure function, no Convex — the highest-bug-risk piece, so it is TDD'd hard.

**Semantics (from spec "Business-hours clamp"):**
- Config disabled → return the timestamp unchanged.
- Timestamp falls on a business day, inside `[startMinutes, endMinutes)` London local time → return unchanged.
- Otherwise → advance to `startMinutes` on the next business day (which may be later the same day if before `startMinutes`), in `Europe/London`, returned as a UTC epoch-ms number. Correct across BST/GMT.

**Files:**
- Create: `lib/email-campaigns/business-hours.ts`
- Test: `lib/email-campaigns/business-hours.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/email-campaigns/business-hours.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/email-campaigns/business-hours.test.ts`
Expected: FAIL — `Cannot find module './business-hours'`.

- [ ] **Step 3: Implement business-hours.ts**

Create `lib/email-campaigns/business-hours.ts`:
```ts
/**
 * Pure business-hours clamping for the email scheduler. No Convex imports —
 * unit-testable in isolation. All times are epoch-ms (UTC); the "business
 * hours" window is interpreted in Europe/London local time so BST/GMT are
 * handled correctly.
 */

export interface BusinessHoursConfig {
  businessHoursEnabled: boolean;
  /** Minutes past local midnight when the window opens, e.g. 540 = 09:00. */
  businessHoursStartUtcMinutes: number;
  /** Minutes past local midnight when the window closes (exclusive), e.g. 1080 = 18:00. */
  businessHoursEndUtcMinutes: number;
  /** Day-of-week numbers that count as business days: 0=Sun … 6=Sat. Seeded [1,2,3,4,5]. */
  businessDays: number[];
}

interface LondonParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  /** 0=Sun … 6=Sat. */
  weekday: number;
}

const LONDON_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Decompose a UTC epoch-ms into Europe/London wall-clock parts. */
function getLondonParts(ts: number): LondonParts {
  const parts = LONDON_FORMAT.formatToParts(ts);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  // Intl can emit "24" for midnight in some engines — normalise.
  if (hour === 24) hour = 0;
  const minute = get("minute");
  // Day-of-week of a calendar date is timezone-independent, so derive it from
  // the London calendar date treated as a UTC date.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

/**
 * Given a London wall-clock date + time, return the matching UTC epoch-ms.
 * Works across DST because we measure the actual offset at the candidate
 * instant. Safe for 09:00 targets (never inside the 01:00–02:00 DST gap).
 */
function londonWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
): number {
  // First guess: treat the wall clock as if it were UTC.
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Measure how far London is ahead of UTC at that instant.
  const guessParts = getLondonParts(guess);
  const guessAsUtc = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
  );
  const offsetMs = guessAsUtc - guess; // +3600000 during BST, 0 during GMT
  return guess - offsetMs;
}

/** True when `ts` is on a business day and inside [start, end) London local. */
export function isWithinBusinessHours(
  ts: number,
  config: BusinessHoursConfig,
): boolean {
  const p = getLondonParts(ts);
  if (!config.businessDays.includes(p.weekday)) return false;
  const minutesIntoDay = p.hour * 60 + p.minute;
  return (
    minutesIntoDay >= config.businessHoursStartUtcMinutes &&
    minutesIntoDay < config.businessHoursEndUtcMinutes
  );
}

/**
 * Clamp `ts` into the next valid business-hours window.
 * - Disabled config → returned unchanged.
 * - Already in-window → returned unchanged.
 * - Before today's window on a business day → today at start.
 * - Otherwise → the next business day at start.
 */
export function clampToBusinessHours(
  ts: number,
  config: BusinessHoursConfig,
): number {
  if (!config.businessHoursEnabled) return ts;
  if (isWithinBusinessHours(ts, config)) return ts;

  const start = getLondonParts(ts);
  const minutesIntoDay = start.hour * 60 + start.minute;
  const isBusinessDay = config.businessDays.includes(start.weekday);

  // Case: business day, before the window opens → today at start.
  if (
    isBusinessDay &&
    minutesIntoDay < config.businessHoursStartUtcMinutes
  ) {
    return londonWallClockToUtc(
      start.year,
      start.month,
      start.day,
      Math.floor(config.businessHoursStartUtcMinutes / 60),
      config.businessHoursStartUtcMinutes % 60,
    );
  }

  // Otherwise advance day-by-day to the next business day, then return its
  // window start. Cap the loop defensively.
  for (let addDays = 1; addDays <= 14; addDays++) {
    const candidateUtcMidnight = Date.UTC(
      start.year,
      start.month - 1,
      start.day + addDays,
    );
    const candidate = getLondonParts(candidateUtcMidnight);
    if (config.businessDays.includes(candidate.weekday)) {
      return londonWallClockToUtc(
        candidate.year,
        candidate.month,
        candidate.day,
        Math.floor(config.businessHoursStartUtcMinutes / 60),
        config.businessHoursStartUtcMinutes % 60,
      );
    }
  }

  // Unreachable with any non-empty businessDays — fail loud rather than silent.
  throw new Error(
    `clampToBusinessHours: no business day found within 14 days (businessDays=${JSON.stringify(config.businessDays)})`,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/email-campaigns/business-hours.test.ts`
Expected: PASS, 11 tests. If a BST case is off by exactly one hour, the bug is in `londonWallClockToUtc` sign handling — `offsetMs` must be positive during BST.

- [ ] **Step 5: Commit**

```bash
git add lib/email-campaigns/business-hours.ts lib/email-campaigns/business-hours.test.ts
git commit -m "feat(email-campaigns): add pure business-hours clamp with BST/GMT handling"
```

---

## Task 3: Resend send wrapper + unsubscribe footer (pure)

`sendCampaignEmail` is the only place that talks to the Resend API. It owns retry/backoff, the `List-Unsubscribe` headers, and tags. The footer builders produce the unsubscribe block appended to every campaign email. All pure — no Convex imports.

**Files:**
- Create: `lib/email-campaigns/resend.ts`
- Test: `lib/email-campaigns/resend.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/email-campaigns/resend.test.ts`:
```ts
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
    listUnsubscribePostUrl: "https://dreamfree.co.uk/api/email-campaigns/unsubscribe?t=tok123",
    tags: { enrollmentId: "enr1", draftId: "drf1", role: "orientation" },
  };

  it("returns ok with the resend id on a 200 first try", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "resend-abc" }), { status: 200 }),
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/email-campaigns/resend.test.ts`
Expected: FAIL — `Cannot find module './resend'`.

- [ ] **Step 3: Implement resend.ts**

Create `lib/email-campaigns/resend.ts`:
```ts
/**
 * Resend HTTP wrapper for campaign emails. No Convex imports — runs in both
 * the Convex default runtime and Next.js. Owns retry/backoff, the
 * List-Unsubscribe headers, the unsubscribe footer, and Resend tags.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 3;
/** Backoff before attempts 2 and 3. Index 0 unused (no wait before attempt 1). */
const BACKOFF_MS = [0, 1_000, 2_000];

export interface SendCampaignEmailArgs {
  from: string;
  to: string;
  subject: string;
  /** Body HTML without the footer — the footer is appended here. */
  bodyHtml: string;
  /** Body plain text without the footer — the footer is appended here. */
  bodyText: string;
  /** The audited site URL, shown in the footer's "you're getting these because" line. */
  reportUrl: string;
  /** The human-facing unsubscribe page URL (footer link + List-Unsubscribe? no — see below). */
  unsubscribeUrl: string;
  /** The one-click POST endpoint used in the List-Unsubscribe header. */
  listUnsubscribePostUrl: string;
  tags: { enrollmentId: string; draftId: string; role: string };
}

export type SendCampaignEmailResult =
  | { ok: true; resendId: string }
  | { ok: false; error: string };

type SleepFn = (ms: number) => Promise<void>;

const realSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The unsubscribe block appended to every campaign email (HTML). */
export function buildUnsubscribeFooterHtml(
  reportUrl: string,
  unsubscribeUrl: string,
): string {
  return `
<hr style="border:none;border-top:1px solid #e2e1dc;margin:24px 0;" />
<p style="color:#7b7b96;font-size:13px;">
  You're getting these because you generated a Signal Score for <a href="${reportUrl}">${reportUrl}</a>.
</p>
<p style="color:#7b7b96;font-size:13px;">
  Don't want to hear from me? <a href="${unsubscribeUrl}">Unsubscribe</a> — one click, no questions asked.
</p>`;
}

/** The unsubscribe block appended to every campaign email (plain text). */
export function buildUnsubscribeFooterText(
  reportUrl: string,
  unsubscribeUrl: string,
): string {
  return `

—
You're getting these because you generated a Signal Score for ${reportUrl}.
Don't want to hear from me? Unsubscribe — one click, no questions asked: ${unsubscribeUrl}`;
}

/**
 * Send one campaign email through Resend with up to 3 attempts. `sleep` is
 * injectable so tests run instantly; production callers omit it.
 */
export async function sendCampaignEmail(
  args: SendCampaignEmailArgs,
  sleep: SleepFn = realSleep,
): Promise<SendCampaignEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  const html =
    args.bodyHtml + buildUnsubscribeFooterHtml(args.reportUrl, args.unsubscribeUrl);
  const text =
    args.bodyText + buildUnsubscribeFooterText(args.reportUrl, args.unsubscribeUrl);

  const payload = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${args.listUnsubscribePostUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "enrollmentId", value: args.tags.enrollmentId },
      { name: "draftId", value: args.tags.draftId },
      { name: "role", value: args.tags.role },
    ],
  };

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        if (data.id) return { ok: true, resendId: data.id };
        lastError = "Resend 200 response had no id";
        continue;
      }
      const errText = await res.text().catch(() => "");
      lastError = `Resend HTTP ${res.status} ${errText.slice(0, 200)}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, error: lastError };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/email-campaigns/resend.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/email-campaigns/resend.ts lib/email-campaigns/resend.test.ts
git commit -m "feat(email-campaigns): add Resend send wrapper with retry + unsubscribe footer"
```

---

## Task 4: Sending data layer — context query, skip/record mutations, scheduler helpers

This builds everything `sendDraft` needs *except* the action itself: the read query, the write mutations for each guard outcome, and the two plain scheduler helpers shared with `emailCampaigns.ts`.

**Files:**
- Create: `convex/emailCampaignsTestSetup.ts` (shared test fixtures — not a Convex module)
- Create: `convex/emailCampaignsSending.ts`
- Test: `convex/emailCampaignsSending.test.ts` (the data-layer half — the action is Task 5)

- [ ] **Step 1: Create the shared test setup helper**

Create `convex/emailCampaignsTestSetup.ts`:
```ts
/**
 * Shared fixtures for email-campaigns convex-test files. Not a Convex module —
 * exports plain async helpers that take the convex-test handle.
 */
import type { TestConvex } from "convex-test";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ROLES } from "../lib/email-campaigns/roles";

type T = TestConvex<typeof schema>;

/** A complete, minimal-but-valid signalReports document body. */
function makeReportFields(leadId: Id<"leads">) {
  const element = {
    score: 6,
    summary: "s",
    analysis: "a",
    businessImpact: "b",
    recommendations: ["r"],
  };
  return {
    leadId,
    anonymousId: "anon-1",
    url: "https://acme-plumbing.test",
    customerDescription: "Homeowners needing emergency plumbing",
    overallScore: 62,
    gruntTest: { pass: true, explanation: "clear enough" },
    elements: {
      character: element,
      problem: element,
      guide: element,
      plan: element,
      cta: element,
      stakes: element,
      transformation: element,
    },
    quickWin: "Add a phone number to the header",
    strengths: ["fast site"],
    fullSummary: "Decent site, weak CTA.",
    status: "success" as const,
    accessLevel: "verified" as const,
    verifyCode: "123456",
    verifyToken: "vtok",
    createdAt: Date.now(),
  };
}

export interface SeededEnrollment {
  sequenceId: Id<"emailSequences">;
  leadId: Id<"leads">;
  reportId: Id<"signalReports">;
  enrollmentId: Id<"emailEnrollments">;
  /** Draft ids in role order, index 0..6. */
  draftIds: Id<"emailDrafts">[];
}

/**
 * Seeds config + sequence + briefs + voice, then creates a lead, a successful
 * report, an enrollment, and 7 drafts (all status "draft"). The enrollment
 * status is whatever the caller passes (default "pending_approval").
 */
export async function seedEnrollment(
  t: T,
  opts: {
    enrollmentStatus?:
      | "pending_approval"
      | "approved"
      | "paused"
      | "stopped"
      | "unsubscribed"
      | "completed";
    leadEmail?: string;
  } = {},
): Promise<SeededEnrollment> {
  await t.mutation(internal.emailCampaigns.seed, {});
  const enrollmentStatus = opts.enrollmentStatus ?? "pending_approval";
  const leadEmail = opts.leadEmail ?? "owner@acme-plumbing.test";

  return await t.run(async (ctx) => {
    const sequence = await ctx.db.query("emailSequences").first();
    if (!sequence) throw new Error("seed did not create a sequence");

    const leadId = await ctx.db.insert("leads", {
      email: leadEmail,
      firstName: "Sam",
      anonymousIds: ["anon-1"],
      sources: ["signal_score"],
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    });

    const reportId = await ctx.db.insert(
      "signalReports",
      makeReportFields(leadId),
    );

    const enrollmentId = await ctx.db.insert("emailEnrollments", {
      leadId,
      sequenceId: sequence._id,
      reportId,
      status: enrollmentStatus,
      voiceVersionUsed: 1,
      loopLedger: [],
      enrolledAt: Date.now(),
    });

    const draftIds: Id<"emailDrafts">[] = [];
    for (let i = 0; i < ROLES.length; i++) {
      const draftId = await ctx.db.insert("emailDrafts", {
        enrollmentId,
        role: ROLES[i],
        order: i,
        subject: `Email ${i + 1} of 7`,
        bodyHtml: `<p>Body ${i}</p>`,
        bodyText: `Body ${i}`,
        status: "draft",
        briefVersionUsed: 1,
        voiceVersionUsed: 1,
        loopsOpenedHere: [],
        loopsClosedHere: [],
        reportFindingsUsed: [],
        isStale: false,
        editedByDaniel: false,
        unsubscribeToken: `tok-${i}`,
      });
      draftIds.push(draftId);
    }

    return {
      sequenceId: sequence._id,
      leadId,
      reportId,
      enrollmentId,
      draftIds,
    };
  });
}
```

- [ ] **Step 2: Write the failing tests for the data layer**

Create `convex/emailCampaignsSending.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { seedEnrollment } from "./emailCampaignsTestSetup";

const modules = import.meta.glob("./**/*.ts");

describe("scheduleDraftSend / cancelScheduledDraft helpers", () => {
  test("scheduleDraftSend marks the draft scheduled with a function id", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, { enrollmentStatus: "approved" });
    const when = Date.now() + 60_000;

    await t.run(async (ctx) => {
      const { scheduleDraftSend } = await import("./emailCampaignsSending");
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
      const { scheduleDraftSend, cancelScheduledDraft } = await import(
        "./emailCampaignsSending"
      );
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
    const { draftIds } = await seedEnrollment(t, { enrollmentStatus: "approved" });
    // Put it in a scheduled state first.
    await t.run(async (ctx) => {
      const { scheduleDraftSend } = await import("./emailCampaignsSending");
      await scheduleDraftSend(ctx, draftIds[0], Date.now());
    });
    const before = Date.now();
    await t.mutation(internal.emailCampaignsSending.rescheduleDraftForKillSwitch, {
      draftId: draftIds[0],
    });
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
    await t.mutation(internal.emailCampaignsSending.recordSendAndScheduleNext, {
      draftId: draftIds[0],
      resendId: "resend-1",
    });

    const orientation = await t.run((ctx) => ctx.db.get(draftIds[0]));
    const backstory = await t.run((ctx) => ctx.db.get(draftIds[1]));
    const sends = await t.run((ctx) =>
      ctx.db
        .query("emailSends")
        .withIndex("by_enrollmentId", (q) => q.eq("enrollmentId", enrollmentId))
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
    await t.mutation(internal.emailCampaignsSending.recordSendAndScheduleNext, {
      draftId: offerDraftId,
      resendId: "resend-7",
    });
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
    const { draftIds } = await seedEnrollment(t, { enrollmentStatus: "approved" });
    const ctx = await t.query(internal.emailCampaignsSending.getSendContext, {
      draftId: draftIds[0],
    });
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
    const ctx = await t.query(internal.emailCampaignsSending.getSendContext, {
      draftId: draftIds[0],
    });
    expect(ctx?.isSuppressed).toBe(true);
  });

  test("laterStaleExists is true when an edited draft has a stale draft after it", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, { enrollmentStatus: "approved" });
    await t.run(async (ctx) => {
      await ctx.db.patch(draftIds[0], { editedByDaniel: true });
      await ctx.db.patch(draftIds[3], { isStale: true });
    });
    const ctx = await t.query(internal.emailCampaignsSending.getSendContext, {
      draftId: draftIds[0],
    });
    expect(ctx?.laterStaleExists).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- convex/emailCampaignsSending.test.ts`
Expected: FAIL — `Cannot find module './emailCampaignsSending'`.

- [ ] **Step 4: Implement emailCampaignsSending.ts (data layer only — no `sendDraft` yet)**

Create `convex/emailCampaignsSending.ts`:
```ts
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { clampToBusinessHours } from "../lib/email-campaigns/business-hours";

/** How long sendDraft waits before retrying itself while the kill switch is on. */
const KILL_SWITCH_RETRY_MS = 60 * 60 * 1000;

// ===== Plain scheduler helpers (shared with emailCampaigns.ts) =====

/**
 * Schedule `sendDraft` for `when`, and mark the draft "scheduled" with the
 * resulting scheduled-function id so it can be cancelled later.
 */
export async function scheduleDraftSend(
  ctx: MutationCtx,
  draftId: Id<"emailDrafts">,
  when: number,
): Promise<void> {
  const fnId = await ctx.scheduler.runAt(
    when,
    internal.emailCampaignsSending.sendDraft,
    { draftId },
  );
  await ctx.db.patch(draftId, {
    status: "scheduled",
    scheduledFor: when,
    scheduledFunctionId: fnId,
  });
}

/**
 * Cancel whichever draft in this enrollment is currently "scheduled" (only one
 * ever is) and reset it back to "draft". No-op if none is scheduled. Returns
 * the affected draft, or null.
 */
export async function cancelScheduledDraft(
  ctx: MutationCtx,
  enrollmentId: Id<"emailEnrollments">,
): Promise<Doc<"emailDrafts"> | null> {
  const drafts = await ctx.db
    .query("emailDrafts")
    .withIndex("by_enrollment", (q) => q.eq("enrollmentId", enrollmentId))
    .collect();
  const scheduled = drafts.find((d) => d.status === "scheduled");
  if (!scheduled) return null;
  if (scheduled.scheduledFunctionId) {
    await ctx.scheduler.cancel(
      scheduled.scheduledFunctionId as Id<"_scheduled_functions">,
    );
  }
  await ctx.db.patch(scheduled._id, {
    status: "draft",
    scheduledFor: undefined,
    scheduledFunctionId: undefined,
  });
  return scheduled;
}

// ===== Read context for the send chokepoint =====

export const getSendContext = internalQuery({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) return null;
    const enrollment = await ctx.db.get(draft.enrollmentId);
    if (!enrollment) return null;
    const lead = await ctx.db.get(enrollment.leadId);
    const report = await ctx.db.get(enrollment.reportId);
    const sequence = await ctx.db.get(enrollment.sequenceId);
    const config = await ctx.db.query("campaignConfig").first();

    // Guard 4 input: this draft was hand-edited AND a later draft is stale.
    let laterStaleExists = false;
    if (draft.editedByDaniel) {
      const siblings = await ctx.db
        .query("emailDrafts")
        .withIndex("by_enrollment", (q) =>
          q.eq("enrollmentId", draft.enrollmentId),
        )
        .collect();
      laterStaleExists = siblings.some(
        (d) => d.order > draft.order && d.isStale && d.status !== "sent",
      );
    }

    // Guard 5 input: the recipient is on the global suppression list.
    let isSuppressed = false;
    if (lead) {
      const suppression = await ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", lead.email))
        .first();
      isSuppressed = suppression !== null;
    }

    return {
      draft,
      enrollment,
      lead,
      report,
      sequence,
      config,
      laterStaleExists,
      isSuppressed,
    };
  },
});

// ===== Guard-outcome mutations =====

export const rescheduleDraftForKillSwitch = internalMutation({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, args) => {
    const when = Date.now() + KILL_SWITCH_RETRY_MS;
    const fnId = await ctx.scheduler.runAt(
      when,
      internal.emailCampaignsSending.sendDraft,
      { draftId: args.draftId },
    );
    await ctx.db.patch(args.draftId, {
      status: "scheduled",
      scheduledFor: when,
      scheduledFunctionId: fnId,
    });
  },
});

export const applySendSkip = internalMutation({
  args: {
    draftId: v.id("emailDrafts"),
    kind: v.union(
      v.literal("terminal"),
      v.literal("stale_cascade"),
      v.literal("suppressed"),
    ),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("applySendSkip: draft not found");

    if (args.kind === "suppressed") {
      await ctx.db.patch(args.draftId, { status: "skipped_suppressed" });
      await ctx.db.patch(draft.enrollmentId, { status: "unsubscribed" });
      return;
    }

    // terminal + stale_cascade both mark the draft skipped_terminal.
    await ctx.db.patch(args.draftId, { status: "skipped_terminal" });
    if (args.kind === "stale_cascade") {
      await ctx.db.patch(draft.enrollmentId, {
        status: "paused",
        pausedReason: "stale_cascade",
        pausedAt: Date.now(),
      });
    }
  },
});

export const markDraftFailed = internalMutation({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.draftId, { status: "failed" });
  },
});

export const recordSendAndScheduleNext = internalMutation({
  args: {
    draftId: v.id("emailDrafts"),
    resendId: v.string(),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("recordSendAndScheduleNext: draft not found");
    const enrollment = await ctx.db.get(draft.enrollmentId);
    if (!enrollment) throw new Error("recordSendAndScheduleNext: enrollment gone");

    const now = Date.now();
    await ctx.db.patch(args.draftId, { status: "sent", sentAt: now });
    await ctx.db.insert("emailSends", {
      enrollmentId: draft.enrollmentId,
      draftId: args.draftId,
      leadId: enrollment.leadId,
      subject: draft.subject,
      resendId: args.resendId,
      status: "sent",
      sentAt: now,
    });

    // The offer is the last email — complete the enrollment, schedule nothing.
    if (draft.role === "offer") {
      await ctx.db.patch(draft.enrollmentId, {
        status: "completed",
        completedAt: now,
      });
      return;
    }

    // Otherwise schedule the next draft, clamped to business hours.
    const sequence = await ctx.db.get(enrollment.sequenceId);
    const config = await ctx.db.query("campaignConfig").first();
    if (!sequence || !config) {
      console.error(
        `recordSendAndScheduleNext: missing sequence/config for enrollment ${draft.enrollmentId} — cannot schedule next`,
      );
      return;
    }
    const nextOrder = draft.order + 1;
    const nextDraft = (
      await ctx.db
        .query("emailDrafts")
        .withIndex("by_enrollment", (q) =>
          q.eq("enrollmentId", draft.enrollmentId),
        )
        .collect()
    ).find((d) => d.order === nextOrder);
    if (!nextDraft) {
      console.error(
        `recordSendAndScheduleNext: no draft at order ${nextOrder} for enrollment ${draft.enrollmentId}`,
      );
      return;
    }
    const gap = sequence.roleGaps[nextOrder] ?? 0;
    const when = clampToBusinessHours(now + gap, config);
    await scheduleDraftSend(ctx, nextDraft._id, when);
  },
});

// ===== sendDraft action — skeleton (filled in fully in Task 5) =====
// Defined here now so `internal.emailCampaignsSending.sendDraft` resolves for
// the scheduler helpers above. Task 5 replaces this body.

export const sendDraft = internalAction({
  args: { draftId: v.id("emailDrafts") },
  handler: async (_ctx, _args) => {
    throw new Error("sendDraft not implemented yet — see Task 5");
  },
});
```

Add `internalAction` to the imports at the top of the file:
```ts
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
```

- [ ] **Step 5: Run codegen, then run the data-layer tests**

Run: `npx convex codegen`
Expected: regenerates `convex/_generated` with the new functions, exits 0.

Run: `npm test -- convex/emailCampaignsSending.test.ts`
Expected: PASS — all data-layer tests (helpers, `applySendSkip`, `rescheduleDraftForKillSwitch`, `recordSendAndScheduleNext`, `getSendContext`). The `sendDraft` skeleton throws if invoked, but no data-layer test invokes it.

- [ ] **Step 6: Commit**

```bash
git add convex/emailCampaignsSending.ts convex/emailCampaignsSending.test.ts convex/emailCampaignsTestSetup.ts convex/_generated
git commit -m "feat(email-campaigns): add send context query, guard mutations, scheduler helpers"
```

---

## Task 5: The `sendDraft` action — five guards + send + chain

`sendDraft` is the send chokepoint. Every email — orientation on approval, every later email via the reactive chain, every kill-switch retry — flows through it. Guard order is load-bearing and matches the spec exactly: **kill switch → terminal status → stale-cascade → suppression → send**.

**Files:**
- Modify: `convex/emailCampaignsSending.ts` (replace the `sendDraft` skeleton)
- Test: `convex/emailCampaignsSending.test.ts` (append the action tests)

- [ ] **Step 1: Append the failing action tests**

At the **top** of `convex/emailCampaignsSending.test.ts`, below the existing imports, add the resend-lib mock and a kill-switch helper:
```ts
import { vi } from "vitest";

vi.mock("../lib/email-campaigns/resend", () => ({
  sendCampaignEmail: vi.fn(),
}));
// eslint-disable-next-line import/first
import { sendCampaignEmail } from "../lib/email-campaigns/resend";
const mockSend = vi.mocked(sendCampaignEmail);

async function disableKillSwitch(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const config = await ctx.db.query("campaignConfig").first();
    if (config) await ctx.db.patch(config._id, { globalKillSwitch: false });
  });
}

/** Put a draft into the "scheduled" state without a real scheduled function. */
async function markScheduled(
  t: ReturnType<typeof convexTest>,
  draftId: Parameters<typeof t.run>[0] extends never ? never : any,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(draftId, {
      status: "scheduled",
      scheduledFor: Date.now(),
    });
  });
}
```

> If the `markScheduled` generic is fiddly, simplify its signature to `(t: any, draftId: any)` — it is test scaffolding, not shipped code.

Then append this `describe` block at the **end** of the file:
```ts
describe("sendDraft action", () => {
  test("guard 0: a draft that is not 'scheduled' is a noop", async () => {
    const t = convexTest(schema, modules);
    const { draftIds } = await seedEnrollment(t, { enrollmentStatus: "approved" });
    await disableKillSwitch(t);
    // draftIds[0] is still status "draft" — not scheduled.
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
    const { draftIds } = await seedEnrollment(t, { enrollmentStatus: "approved" });
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
    const { draftIds } = await seedEnrollment(t, { enrollmentStatus: "stopped" });
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
        .withIndex("by_enrollmentId", (q) => q.eq("enrollmentId", enrollmentId))
        .collect(),
    );
    expect(orientation?.status).toBe("sent");
    expect(backstory?.status).toBe("scheduled");
    expect(sends).toHaveLength(1);
    expect(sends[0].resendId).toBe("resend-orientation");

    // Verify the send args carried the unsubscribe URLs and tags.
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
    const { draftIds } = await seedEnrollment(t, { enrollmentStatus: "approved" });
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
```

> **convex-test + `vi.mock` note:** `vi.mock` is hoisted and replaces the `resend` module in vitest's registry; convex-test loads function modules through the same registry, so the action sees the mocked `sendCampaignEmail`. Reset between tests is automatic because each `test` gets a fresh `mockResolvedValue`. If a stray test sees a real call, add `beforeEach(() => mockSend.mockReset())`.

- [ ] **Step 2: Run the action tests to verify they fail**

Run: `npm test -- convex/emailCampaignsSending.test.ts`
Expected: the 8 `sendDraft action` tests FAIL with `sendDraft not implemented yet — see Task 5`. The data-layer tests still PASS.

- [ ] **Step 3: Replace the `sendDraft` skeleton with the real implementation**

In `convex/emailCampaignsSending.ts`, add the import near the top:
```ts
import { sendCampaignEmail } from "../lib/email-campaigns/resend";
```

Replace the entire skeleton `export const sendDraft = internalAction({ ... })` block with:
```ts
/** Enrollment statuses at which a scheduled send must be abandoned. */
const TERMINAL_ENROLLMENT_STATUSES = [
  "paused",
  "stopped",
  "unsubscribed",
  "completed",
  "generation_failed",
];

/**
 * The send chokepoint. Runs five ordered guards, then sends via Resend and
 * (on success) lets `recordSendAndScheduleNext` advance the chain. Every
 * campaign email — orientation, every chained email, every kill-switch
 * retry — passes through here.
 */
export const sendDraft = internalAction({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.emailCampaignsSending.getSendContext,
      { draftId: args.draftId },
    );
    if (!context) {
      console.error(`sendDraft: no context for draft ${args.draftId} — noop`);
      return;
    }
    const {
      draft,
      enrollment,
      lead,
      report,
      config,
      laterStaleExists,
      isSuppressed,
    } = context;

    // Guard 0 (defensive): only act on a draft that is actually scheduled.
    // Pause clears the draft back to "draft" and cancels the scheduled fn; a
    // resumed/already-sent draft must not be re-sent.
    if (draft.status !== "scheduled") {
      console.log(
        `sendDraft: draft ${args.draftId} status=${draft.status}, not scheduled — noop`,
      );
      return;
    }

    if (!config) {
      console.error(
        `sendDraft: campaignConfig missing — marking draft ${args.draftId} failed`,
      );
      await ctx.runMutation(internal.emailCampaignsSending.markDraftFailed, {
        draftId: args.draftId,
      });
      return;
    }

    // Guard 1: global kill switch. Reschedule self for +1h, keep status scheduled.
    if (config.globalKillSwitch) {
      await ctx.runMutation(
        internal.emailCampaignsSending.rescheduleDraftForKillSwitch,
        { draftId: args.draftId },
      );
      return;
    }

    // Guard 2: terminal enrollment status.
    if (TERMINAL_ENROLLMENT_STATUSES.includes(enrollment.status)) {
      await ctx.runMutation(internal.emailCampaignsSending.applySendSkip, {
        draftId: args.draftId,
        kind: "terminal",
      });
      return;
    }

    // Guard 3: stale-cascade — this draft was hand-edited and a later draft is
    // stale. Refuse to send and pause loudly so Daniel regenerates.
    if (draft.editedByDaniel && laterStaleExists) {
      await ctx.runMutation(internal.emailCampaignsSending.applySendSkip, {
        draftId: args.draftId,
        kind: "stale_cascade",
      });
      return;
    }

    // Guard 4: recipient on the global suppression list.
    if (isSuppressed) {
      await ctx.runMutation(internal.emailCampaignsSending.applySendSkip, {
        draftId: args.draftId,
        kind: "suppressed",
      });
      return;
    }

    // Guard 5: send.
    if (!lead || !report) {
      console.error(
        `sendDraft: missing lead/report for draft ${args.draftId} — marking failed`,
      );
      await ctx.runMutation(internal.emailCampaignsSending.markDraftFailed, {
        draftId: args.draftId,
      });
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const result = await sendCampaignEmail({
      from: config.fromAddress,
      to: lead.email,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      bodyText: draft.bodyText,
      reportUrl: report.url,
      unsubscribeUrl: `${config.unsubscribeBaseUrl}?t=${draft.unsubscribeToken}`,
      listUnsubscribePostUrl: `${siteUrl}/api/email-campaigns/unsubscribe?t=${draft.unsubscribeToken}`,
      tags: {
        enrollmentId: enrollment._id,
        draftId: draft._id,
        role: draft.role,
      },
    });

    if (result.ok) {
      await ctx.runMutation(
        internal.emailCampaignsSending.recordSendAndScheduleNext,
        { draftId: args.draftId, resendId: result.resendId },
      );
    } else {
      console.error(
        `sendDraft: Resend send failed for draft ${args.draftId}: ${result.error}`,
      );
      await ctx.runMutation(internal.emailCampaignsSending.markDraftFailed, {
        draftId: args.draftId,
      });
    }
  },
});
```

- [ ] **Step 4: Run the full file to verify all tests pass**

Run: `npm test -- convex/emailCampaignsSending.test.ts`
Expected: PASS — all data-layer tests **and** all 8 `sendDraft action` tests.

- [ ] **Step 5: Commit**

```bash
git add convex/emailCampaignsSending.ts convex/emailCampaignsSending.test.ts convex/_generated
git commit -m "feat(email-campaigns): implement sendDraft action — five guards, send, reactive chain"
```

---

## Task 6: Wire `approveEnrollment` to schedule the orientation email

Approval is the only place a sequence gets its *first* scheduled send. Everything after is reactive. This task modifies `approveEnrollment` in `convex/emailCampaigns.ts` to schedule **only** the orientation draft.

**Files:**
- Modify: `convex/emailCampaigns.ts` (imports + `approveEnrollment`)
- Test: `convex/emailCampaignsScheduling.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `convex/emailCampaignsScheduling.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- convex/emailCampaignsScheduling.test.ts`
Expected: FAIL — the first two tests fail because `approveEnrollment` does not schedule anything yet (orientation stays `"draft"`). The third test already passes (the status guard exists).

- [ ] **Step 3: Add imports to convex/emailCampaigns.ts**

At the top of `convex/emailCampaigns.ts`, after the existing `roles` import block, add:
```ts
import { clampToBusinessHours } from "../lib/email-campaigns/business-hours";
import {
  scheduleDraftSend,
  cancelScheduledDraft,
} from "./emailCampaignsSending";
```

- [ ] **Step 4: Replace `approveEnrollment` in convex/emailCampaigns.ts**

Replace the existing `export const approveEnrollment = mutation({ ... })` block with:
```ts
export const approveEnrollment = mutation({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (enrollment.status !== "pending_approval") {
      throw new Error(
        `Cannot approve from status=${enrollment.status} (must be pending_approval)`,
      );
    }

    const sequence = await ctx.db.get(enrollment.sequenceId);
    const config = await ctx.db.query("campaignConfig").first();
    if (!sequence || !config) {
      throw new Error(
        "Cannot approve — sequence or campaignConfig missing (run emailCampaigns:seed)",
      );
    }

    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_enrollment", (q) =>
        q.eq("enrollmentId", args.enrollmentId),
      )
      .collect();
    const orientation = drafts.find((d) => d.order === 0);
    if (!orientation) {
      throw new Error("Cannot approve — orientation draft missing");
    }

    await ctx.db.patch(args.enrollmentId, {
      status: "approved",
      approvedAt: Date.now(),
    });

    // Schedule ONLY the orientation email. Drafts 2–7 are scheduled reactively
    // by sendDraft after each previous email successfully sends.
    const base = Math.max(Date.now(), enrollment.enrolledAt + 2 * 60_000);
    const when = sequence.orientationRespectsBusinessHours
      ? clampToBusinessHours(base, config)
      : base;
    await scheduleDraftSend(ctx, orientation._id, when);
  },
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- convex/emailCampaignsScheduling.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the whole suite to catch regressions**

Run: `npm test`
Expected: PASS — all files green.

- [ ] **Step 7: Commit**

```bash
git add convex/emailCampaigns.ts convex/emailCampaignsScheduling.test.ts convex/_generated
git commit -m "feat(email-campaigns): approveEnrollment schedules the orientation email"
```

---

## Task 7: Pause / Resume / Stop / Suppress — cancel and reschedule

Pause, stop, and manual suppression must cancel the in-flight scheduled send. Resume must reschedule the next unsent draft. This modifies four existing mutations in `convex/emailCampaigns.ts`.

**Files:**
- Modify: `convex/emailCampaigns.ts` (`pauseEnrollment`, `resumeEnrollment`, `stopEnrollment`, `suppressEmail`)
- Test: `convex/emailCampaignsScheduling.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `convex/emailCampaignsScheduling.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- convex/emailCampaignsScheduling.test.ts`
Expected: the four new pause/resume/stop/suppress tests FAIL (drafts stay `"scheduled"` because no cancellation wired). The Task 6 tests still PASS.

- [ ] **Step 3: Replace `pauseEnrollment` in convex/emailCampaigns.ts**

```ts
export const pauseEnrollment = mutation({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    reason: v.union(v.literal("replied"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (enrollment.status !== "approved") {
      throw new Error(
        `Cannot pause from status=${enrollment.status} (must be approved)`,
      );
    }
    await ctx.db.patch(args.enrollmentId, {
      status: "paused",
      pausedReason: args.reason,
      pausedAt: Date.now(),
    });
    // Cancel the in-flight scheduled send and reset that draft to "draft".
    await cancelScheduledDraft(ctx, args.enrollmentId);
  },
});
```

- [ ] **Step 4: Replace `resumeEnrollment` in convex/emailCampaigns.ts**

```ts
export const resumeEnrollment = mutation({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (enrollment.status !== "paused") {
      throw new Error(
        `Cannot resume from status=${enrollment.status} (must be paused)`,
      );
    }
    const sequence = await ctx.db.get(enrollment.sequenceId);
    const config = await ctx.db.query("campaignConfig").first();
    if (!sequence || !config) {
      throw new Error(
        "Cannot resume — sequence or campaignConfig missing (run emailCampaigns:seed)",
      );
    }

    await ctx.db.patch(args.enrollmentId, {
      status: "approved",
      pausedReason: undefined,
      pausedAt: undefined,
    });

    // Reschedule the next unsent draft (lowest order with status "draft").
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_enrollment", (q) =>
        q.eq("enrollmentId", args.enrollmentId),
      )
      .collect();
    drafts.sort((a, b) => a.order - b.order);
    const next = drafts.find((d) => d.status === "draft");
    if (!next) {
      // Every draft is already sent/skipped — nothing to reschedule.
      return;
    }
    // Orientation resumes immediately; any later role uses its gap, clamped.
    const when =
      next.order === 0
        ? Date.now()
        : clampToBusinessHours(
            Date.now() + (sequence.roleGaps[next.order] ?? 0),
            config,
          );
    await scheduleDraftSend(ctx, next._id, when);
  },
});
```

- [ ] **Step 5: Replace `stopEnrollment` in convex/emailCampaigns.ts**

```ts
export const stopEnrollment = mutation({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (
      enrollment.status === "completed" ||
      enrollment.status === "stopped" ||
      enrollment.status === "unsubscribed"
    ) {
      throw new Error(
        `Cannot stop from status=${enrollment.status} (already terminal)`,
      );
    }
    await ctx.db.patch(args.enrollmentId, {
      status: "stopped",
      stoppedAt: Date.now(),
    });
    // Cancel any in-flight scheduled send.
    await cancelScheduledDraft(ctx, args.enrollmentId);
  },
});
```

- [ ] **Step 6: Update `suppressEmail` in convex/emailCampaigns.ts**

In the existing `suppressEmail` handler, find the `if (args.enrollmentId) { ... }` block that patches the enrollment to `"unsubscribed"`. Add a `cancelScheduledDraft` call inside that block, right after the `ctx.db.patch(args.enrollmentId, { status: "unsubscribed" })` line:
```ts
    // If a current enrollment is provided and active, terminate it.
    if (args.enrollmentId) {
      const enrollment = await ctx.db.get(args.enrollmentId);
      if (
        enrollment &&
        enrollment.status !== "completed" &&
        enrollment.status !== "stopped" &&
        enrollment.status !== "unsubscribed"
      ) {
        await ctx.db.patch(args.enrollmentId, {
          status: "unsubscribed",
        });
        // Cancel any in-flight scheduled send for this enrollment.
        await cancelScheduledDraft(ctx, args.enrollmentId);
      }
    }
```

- [ ] **Step 7: Run the scheduling tests to verify they pass**

Run: `npm test -- convex/emailCampaignsScheduling.test.ts`
Expected: PASS — all Task 6 + Task 7 tests (8 total).

- [ ] **Step 8: Commit**

```bash
git add convex/emailCampaigns.ts convex/emailCampaignsScheduling.test.ts convex/_generated
git commit -m "feat(email-campaigns): pause/resume/stop/suppress cancel and reschedule sends"
```

---

## Task 8: Resend webhook — the `recordResendEvent` Convex mutation

This is the Convex side of the webhook: a public mutation that the Next.js route (Task 10) forwards verified events to. It is public because `ConvexHttpClient` can only call public functions — so it additionally checks a shared secret as belt-and-braces.

**Files:**
- Create: `convex/emailCampaignsInbound.ts`
- Test: `convex/emailCampaignsInbound.test.ts` (new file — webhook half)

- [ ] **Step 1: Write the failing tests**

Create `convex/emailCampaignsInbound.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedEnrollment } from "./emailCampaignsTestSetup";

const modules = import.meta.glob("./**/*.ts");

const WEBHOOK_SECRET = "whsec_test_secret";

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
    const { scheduleDraftSend } = await import("./emailCampaignsSending");
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
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `npm test -- convex/emailCampaignsInbound.test.ts`
Expected: FAIL — `Cannot find module './emailCampaignsInbound'` / `api.emailCampaignsInbound` undefined.

- [ ] **Step 3: Implement the webhook mutation**

Create `convex/emailCampaignsInbound.ts`:
```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { cancelScheduledDraft } from "./emailCampaignsSending";

/** Insert a suppression row for `email` if one does not already exist. */
async function ensureSuppressed(
  ctx: MutationCtx,
  email: string,
  reason: "unsubscribed" | "bounced" | "complained" | "manual",
  enrollmentId?: Id<"emailEnrollments">,
): Promise<void> {
  const existing = await ctx.db
    .query("emailSuppressions")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (existing) return;
  await ctx.db.insert("emailSuppressions", {
    email,
    reason,
    suppressedAt: Date.now(),
    enrollmentId,
  });
}

/**
 * Apply one parsed Resend webhook event. Public because Next.js's
 * ConvexHttpClient can only call public functions — guarded by a shared
 * secret. Signature verification itself happens in the Next.js route (it
 * needs the raw body + svix headers).
 */
export const recordResendEvent = mutation({
  args: {
    webhookSecret: v.string(),
    eventType: v.union(
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("complained"),
    ),
    resendId: v.string(),
    occurredAt: v.number(),
    clickedUrl: v.optional(v.string()),
  },
  returns: v.object({ matched: v.boolean() }),
  handler: async (ctx, args) => {
    const expectedSecret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
    if (!expectedSecret || args.webhookSecret !== expectedSecret) {
      throw new Error("recordResendEvent: webhook secret mismatch");
    }

    const send = await ctx.db
      .query("emailSends")
      .withIndex("by_resendId", (q) => q.eq("resendId", args.resendId))
      .first();
    if (!send) {
      console.warn(
        `recordResendEvent: no emailSends row for resendId=${args.resendId} (event=${args.eventType})`,
      );
      return { matched: false };
    }

    switch (args.eventType) {
      case "delivered": {
        // Only promote forward — never downgrade opened/clicked back.
        if (send.status === "sent") {
          await ctx.db.patch(send._id, { status: "delivered" });
        }
        break;
      }
      case "opened": {
        if (send.openedAt === undefined) {
          await ctx.db.patch(send._id, { openedAt: args.occurredAt });
        }
        if (send.status === "sent" || send.status === "delivered") {
          await ctx.db.patch(send._id, { status: "opened" });
        }
        break;
      }
      case "clicked": {
        await ctx.db.patch(send._id, {
          status: "clicked",
          clickedAt: args.occurredAt,
          clickedUrl: args.clickedUrl,
        });
        break;
      }
      case "bounced":
      case "complained": {
        const reason =
          args.eventType === "bounced" ? "bounced" : "complained";
        await ctx.db.patch(send._id, {
          status: reason,
          ...(args.eventType === "bounced"
            ? { bouncedAt: args.occurredAt }
            : {}),
        });
        const lead = await ctx.db.get(send.leadId);
        if (lead) {
          await ensureSuppressed(ctx, lead.email, reason, send.enrollmentId);
        }
        const enrollment = await ctx.db.get(send.enrollmentId);
        if (
          enrollment &&
          enrollment.status !== "completed" &&
          enrollment.status !== "stopped" &&
          enrollment.status !== "unsubscribed"
        ) {
          await ctx.db.patch(send.enrollmentId, { status: "unsubscribed" });
        }
        // Stop the next scheduled email from going out.
        await cancelScheduledDraft(ctx, send.enrollmentId);
        break;
      }
    }

    return { matched: true };
  },
});
```

- [ ] **Step 4: Run codegen and the tests**

Run: `npx convex codegen`
Run: `npm test -- convex/emailCampaignsInbound.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add convex/emailCampaignsInbound.ts convex/emailCampaignsInbound.test.ts convex/_generated
git commit -m "feat(email-campaigns): add recordResendEvent webhook mutation"
```

---

## Task 9: Unsubscribe — `processUnsubscribe` & `undoUnsubscribe` mutations

Two public mutations that self-verify the HMAC unsubscribe token (via `verifyUnsubscribeToken` from Plan 1) and apply the suppression. Public so Next.js can call them; safe because the token *is* the authorization.

> **Runtime note:** `jose`'s `jwtVerify` uses the Web Crypto API, which is available in Convex's default runtime for queries/mutations/actions alike — so verifying inside a mutation is fine. If, against expectation, codegen or a test reveals it cannot run in a mutation, convert these two to public **actions** that verify then `ctx.runMutation` an internal mutation holding the body. Do not change the external signature.

**Files:**
- Modify: `convex/emailCampaignsInbound.ts` (add two mutations + import)
- Test: `convex/emailCampaignsInbound.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `convex/emailCampaignsInbound.test.ts`:
```ts
import { signUnsubscribeToken } from "../lib/email-campaigns/unsubscribe-token";

const UNSUB_SECRET = "unsubscribe-signing-secret-at-least-32ch";

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
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `npm test -- convex/emailCampaignsInbound.test.ts`
Expected: the 5 new unsubscribe tests FAIL (`processUnsubscribe`/`undoUnsubscribe` undefined). The 7 webhook tests still PASS.

- [ ] **Step 3: Add the unsubscribe mutations**

In `convex/emailCampaignsInbound.ts`, add the import at the top:
```ts
import { verifyUnsubscribeToken } from "../lib/email-campaigns/unsubscribe-token";
```

Append these two mutations to the file:
```ts
/**
 * One-click unsubscribe. Verifies the HMAC token itself (the token is the
 * authorization), then suppresses the email, unsubscribes the enrollment, and
 * cancels any scheduled send. Idempotent.
 */
export const processUnsubscribe = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      alreadyProcessed: v.boolean(),
      email: v.string(),
    }),
    v.object({ ok: v.literal(false), reason: v.literal("invalid_token") }),
  ),
  handler: async (ctx, args) => {
    const payload = await verifyUnsubscribeToken(args.token);
    if (!payload) return { ok: false as const, reason: "invalid_token" as const };

    const enrollment = await ctx.db.get(
      payload.enrollmentId as Id<"emailEnrollments">,
    );
    if (!enrollment) {
      return { ok: false as const, reason: "invalid_token" as const };
    }
    const lead = await ctx.db.get(enrollment.leadId);
    if (!lead) {
      return { ok: false as const, reason: "invalid_token" as const };
    }

    const existing = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", lead.email))
      .first();
    if (existing) {
      // Already suppressed — make sure the enrollment is consistent, but do
      // not insert a duplicate row.
      if (enrollment.status !== "unsubscribed") {
        await ctx.db.patch(enrollment._id, { status: "unsubscribed" });
        await cancelScheduledDraft(ctx, enrollment._id);
      }
      return {
        ok: true as const,
        alreadyProcessed: true,
        email: lead.email,
      };
    }

    await ctx.db.insert("emailSuppressions", {
      email: lead.email,
      reason: "unsubscribed",
      suppressedAt: Date.now(),
      enrollmentId: enrollment._id,
    });
    await ctx.db.patch(enrollment._id, { status: "unsubscribed" });
    await cancelScheduledDraft(ctx, enrollment._id);

    return { ok: true as const, alreadyProcessed: false, email: lead.email };
  },
});

/**
 * "I unsubscribed by accident." Removes the unsubscribe suppression and parks
 * the enrollment in "paused" so Daniel reviews before any further sends.
 * Only undoes `unsubscribed` suppressions — never bounce/complaint ones.
 */
export const undoUnsubscribe = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.literal("invalid_token") }),
  ),
  handler: async (ctx, args) => {
    const payload = await verifyUnsubscribeToken(args.token);
    if (!payload) return { ok: false as const, reason: "invalid_token" as const };

    const enrollment = await ctx.db.get(
      payload.enrollmentId as Id<"emailEnrollments">,
    );
    if (!enrollment) {
      return { ok: false as const, reason: "invalid_token" as const };
    }
    const lead = await ctx.db.get(enrollment.leadId);
    if (!lead) {
      return { ok: false as const, reason: "invalid_token" as const };
    }

    const suppression = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", lead.email))
      .first();
    if (suppression && suppression.reason === "unsubscribed") {
      await ctx.db.delete(suppression._id);
    }
    // Park in paused — Daniel decides whether to resume.
    await ctx.db.patch(enrollment._id, {
      status: "paused",
      pausedReason: "manual",
      pausedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
```

- [ ] **Step 4: Run codegen and the tests**

Run: `npx convex codegen`
Run: `npm test -- convex/emailCampaignsInbound.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — every file green.

- [ ] **Step 6: Commit**

```bash
git add convex/emailCampaignsInbound.ts convex/emailCampaignsInbound.test.ts convex/_generated
git commit -m "feat(email-campaigns): add processUnsubscribe + undoUnsubscribe mutations"
```

---

## Task 10: Resend webhook Next.js route

The public endpoint Resend POSTs delivery/open/click/bounce/complaint events to. It verifies the svix signature (svix needs the raw body + headers, so this *must* be the Node-runtime Next.js route, not Convex), maps the event, and forwards to `recordResendEvent`.

**Pre-flight:** This Next.js version has non-standard conventions (see `AGENTS.md`). The route-handler shape used here — `export async function POST(req: NextRequest)` returning `NextResponse.json(...)` — matches the existing, working `app/api/report/[id]/callback/route.ts`. Follow that proven pattern; do not invent a different one.

**Files:**
- Create: `app/api/email-campaigns/resend-webhook/route.ts`
- Test: `app/api/email-campaigns/resend-webhook/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/email-campaigns/resend-webhook/route.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock svix so we control signature verification.
const verifyMock = vi.fn();
vi.mock("svix", () => ({
  Webhook: vi.fn().mockImplementation(() => ({ verify: verifyMock })),
}));

// Mock the Convex client so no network call happens.
const mutationMock = vi.fn();
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

// eslint-disable-next-line import/first
import { POST } from "./route";

function makeRequest(body: string) {
  return new Request("https://dreamfree.co.uk/api/email-campaigns/resend-webhook", {
    method: "POST",
    body,
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": "1700000000",
      "svix-signature": "v1,sig",
    },
  });
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
      data: { email_id: "resend-456", click: { link: "https://dreamfree.co.uk/pricing" } },
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
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `npm test -- app/api/email-campaigns/resend-webhook/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

Create `app/api/email-campaigns/resend-webhook/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Resend event type → the eventType the Convex mutation accepts. */
const EVENT_MAP: Record<
  string,
  "delivered" | "opened" | "clicked" | "bounced" | "complained"
> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    click?: { link?: string };
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SIGNING_SECRET is not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const payload = await req.text();
  const svixHeaders = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(payload, svixHeaders) as ResendEvent;
  } catch (err) {
    console.error("Resend webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const mapped = event.type ? EVENT_MAP[event.type] : undefined;
  if (!mapped) {
    // email.sent, email.delivery_delayed, etc. — acknowledge without acting.
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }

  const resendId = event.data?.email_id;
  if (!resendId) {
    return NextResponse.json({ error: "missing_email_id" }, { status: 400 });
  }

  const occurredAt =
    Date.parse(event.created_at ?? event.data?.created_at ?? "") || Date.now();
  const clickedUrl =
    mapped === "clicked" ? event.data?.click?.link : undefined;

  try {
    await convex.mutation(api.emailCampaignsInbound.recordResendEvent, {
      webhookSecret: secret,
      eventType: mapped,
      resendId,
      occurredAt,
      clickedUrl,
    });
  } catch (err) {
    console.error("recordResendEvent failed:", err);
    return NextResponse.json({ error: "convex_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/api/email-campaigns/resend-webhook/route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Lint the new files**

Run: `npm run lint`
Expected: no errors in the new files. Fix any (e.g. an unused `NextRequest` import — keep it, it types the param).

- [ ] **Step 6: Commit**

```bash
git add app/api/email-campaigns/resend-webhook vitest.config.ts
git commit -m "feat(email-campaigns): add Resend webhook route with svix verification"
```

---

## Task 11: Unsubscribe page + one-click & undo routes

The recipient-facing surface: a `/unsubscribe` page (footer link target, GET, friendly UI), a one-click POST route (`List-Unsubscribe` header target, RFC 8058), and an "undo" POST route behind the "by accident" button. The route handlers are TDD'd; the page + client component are thin glue over the already-tested `processUnsubscribe`/`undoUnsubscribe` mutations and are verified manually in Task 12.

**Files:**
- Create: `app/api/email-campaigns/unsubscribe/route.ts` (+ `.test.ts`)
- Create: `app/api/email-campaigns/undo-unsubscribe/route.ts` (+ `.test.ts`)
- Create: `app/unsubscribe/page.tsx`
- Create: `app/unsubscribe/UndoUnsubscribeButton.tsx`

- [ ] **Step 1: Write the failing route tests**

Create `app/api/email-campaigns/unsubscribe/route.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mutationMock = vi.fn();
vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({ mutation: mutationMock })),
}));
vi.mock("@/convex/_generated/api", () => ({
  api: { emailCampaignsInbound: { processUnsubscribe: "processUnsubscribe-ref" } },
}));

// eslint-disable-next-line import/first
import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  mutationMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/email-campaigns/unsubscribe (one-click)", () => {
  test("forwards the ?t= token to processUnsubscribe and returns 200", async () => {
    mutationMock.mockResolvedValue({ ok: true, alreadyProcessed: false, email: "a@b.c" });
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
```

Create `app/api/email-campaigns/undo-unsubscribe/route.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mutationMock = vi.fn();
vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({ mutation: mutationMock })),
}));
vi.mock("@/convex/_generated/api", () => ({
  api: { emailCampaignsInbound: { undoUnsubscribe: "undoUnsubscribe-ref" } },
}));

// eslint-disable-next-line import/first
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
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(mutationMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `npm test -- app/api/email-campaigns/unsubscribe app/api/email-campaigns/undo-unsubscribe`
Expected: FAIL — `Cannot find module './route'` for both.

- [ ] **Step 3: Implement the one-click route**

Create `app/api/email-campaigns/unsubscribe/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Token comes from ?t=; fall back to a form body for odd one-click clients. */
async function extractToken(req: NextRequest): Promise<string | null> {
  const fromQuery = req.nextUrl.searchParams.get("t");
  if (fromQuery) return fromQuery;
  try {
    const form = await req.formData();
    const t = form.get("t");
    return typeof t === "string" && t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = await extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  try {
    await convex.mutation(api.emailCampaignsInbound.processUnsubscribe, {
      token,
    });
  } catch (err) {
    console.error("processUnsubscribe (one-click) failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  // RFC 8058: a 200 is all the mail client needs.
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Implement the undo route**

Create `app/api/email-campaigns/undo-unsubscribe/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  let token: string | undefined;
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token;
  } catch {
    token = undefined;
  }
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  try {
    const result = await convex.mutation(
      api.emailCampaignsInbound.undoUnsubscribe,
      { token },
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("undoUnsubscribe failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run the route tests to verify they pass**

Run: `npm test -- app/api/email-campaigns/unsubscribe app/api/email-campaigns/undo-unsubscribe`
Expected: PASS, 4 tests.

- [ ] **Step 6: Implement the "by accident" client component**

Create `app/unsubscribe/UndoUnsubscribeButton.tsx`:
```tsx
"use client";

import { useState } from "react";

type State = "idle" | "loading" | "done" | "error";

export function UndoUnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<State>("idle");

  if (state === "done") {
    return (
      <p style={{ color: "#0d7377", fontSize: "14px", marginTop: "16px" }}>
        Done — you&rsquo;re back on the list. Daniel will review before any
        further emails go out.
      </p>
    );
  }

  return (
    <div style={{ marginTop: "16px" }}>
      <button
        type="button"
        disabled={state === "loading"}
        onClick={async () => {
          setState("loading");
          try {
            const res = await fetch(
              "/api/email-campaigns/undo-unsubscribe",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
              },
            );
            setState(res.ok ? "done" : "error");
          } catch {
            setState("error");
          }
        }}
        style={{
          background: "none",
          border: "none",
          color: "#7b7b96",
          fontSize: "13px",
          textDecoration: "underline",
          cursor: state === "loading" ? "default" : "pointer",
          padding: 0,
        }}
      >
        {state === "loading" ? "Working…" : "I unsubscribed by accident"}
      </button>
      {state === "error" && (
        <p style={{ color: "#b00", fontSize: "13px", marginTop: "8px" }}>
          Something went wrong — please email daniel@dreamfree.co.uk.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Implement the unsubscribe page**

Create `app/unsubscribe/page.tsx`:
```tsx
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { UndoUnsubscribeButton } from "./UndoUnsubscribeButton";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const metadata = {
  title: "Unsubscribe — Dreamfree",
  robots: { index: false, follow: false },
};

const wrap: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  maxWidth: "520px",
  margin: "80px auto",
  padding: "0 24px",
  color: "#1a1a2e",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  // No token at all → generic error, never call Convex.
  if (!t) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: "22px" }}>Link not recognised</h1>
        <p style={{ color: "#4a4a68", lineHeight: 1.7 }}>
          This unsubscribe link is missing or invalid. If you want to stop
          hearing from us, just reply to any email and we&rsquo;ll sort it.
        </p>
      </main>
    );
  }

  // The mutation self-verifies the token and is idempotent — safe to call on render.
  let ok = false;
  try {
    const result = await convex.mutation(
      api.emailCampaignsInbound.processUnsubscribe,
      { token: t },
    );
    ok = result.ok;
  } catch {
    ok = false;
  }

  if (!ok) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: "22px" }}>Link not recognised</h1>
        <p style={{ color: "#4a4a68", lineHeight: 1.7 }}>
          This unsubscribe link is invalid or has expired. If you want to stop
          hearing from us, just reply to any email and we&rsquo;ll sort it.
        </p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: "22px" }}>You&rsquo;re unsubscribed</h1>
      <p style={{ color: "#4a4a68", lineHeight: 1.7 }}>
        You won&rsquo;t hear from us again — no more emails from this sequence.
        Thanks for taking a look.
      </p>
      <UndoUnsubscribeButton token={t} />
    </main>
  );
}
```

- [ ] **Step 8: Build to verify the page compiles**

Run: `npm run build`
Expected: build succeeds; `/unsubscribe` appears in the route list. If the build complains about `searchParams` typing, check `node_modules/next/dist/docs/` for this version's page-props convention and adjust (it may be a Promise, as `params` is in `app/api/report/[id]/callback/route.ts`).

- [ ] **Step 9: Run the full test suite + lint**

Run: `npm test`
Run: `npm run lint`
Expected: all tests PASS; lint clean for new files.

- [ ] **Step 10: Commit**

```bash
git add app/api/email-campaigns/unsubscribe app/api/email-campaigns/undo-unsubscribe app/unsubscribe
git commit -m "feat(email-campaigns): add unsubscribe page, one-click route, and undo route"
```

---

## Task 12: Environment, end-to-end verification & branch finishing

Wire up env vars, push functions to the Convex dev deployment, smoke-test the whole flow on Daniel's machine, then finish the branch.

**Files:** none created — configuration + verification only.

- [ ] **Step 1: Confirm the new env var is documented**

The only **new** secret this plan introduces is `RESEND_WEBHOOK_SIGNING_SECRET`. It must be set in **two** places:
- **Convex** (dev deployment `lovable-marmot-864`, and prod later) — read by `recordResendEvent`.
- **Vercel / `.env.local`** — read by the Next.js webhook route for svix verification.

Already-present vars this plan relies on (verify, do not recreate): `UNSUBSCRIBE_SIGNING_SECRET` (Convex — set on dev in Plan 1), `RESEND_API_KEY` (Convex — used by transactional emails), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`.

- [ ] **Step 2: Set `RESEND_WEBHOOK_SIGNING_SECRET` on the Convex dev deployment**

Daniel must run this himself (interactive auth) — in the Claude Code prompt, type:
```
! npx convex env set RESEND_WEBHOOK_SIGNING_SECRET <value-from-resend-dashboard>
```
The value is generated in the next step; if configuring Resend first, come back. To check what is already set:
```
! npx convex env list
```
Expected: `RESEND_WEBHOOK_SIGNING_SECRET`, `UNSUBSCRIBE_SIGNING_SECRET`, `RESEND_API_KEY`, `OPENROUTER_API_KEY` all present. If `RESEND_API_KEY` is **missing** on dev, set it from the Resend dashboard — `sendDraft` cannot send without it.

- [ ] **Step 3: Configure the Resend webhook endpoint**

In the Resend dashboard → Webhooks → Add Endpoint:
- **Endpoint URL:** `https://dreamfree.co.uk/api/email-campaigns/resend-webhook` (production). For pre-deploy testing against a Vercel preview, use the preview URL instead, or skip webhook testing until deploy (Step 8 covers this).
- **Events:** `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`. (`email.sent` optional — the route ignores it.)
- Copy the **Signing Secret** → that is the `RESEND_WEBHOOK_SIGNING_SECRET` value for Step 2 and for `.env.local`.

Add to `.env.local` (do NOT commit):
```
RESEND_WEBHOOK_SIGNING_SECRET=whsec_...
```

- [ ] **Step 4: Push functions to the Convex dev deployment**

Run: `npx convex dev --once`
Expected: deploys `emailCampaignsSending`, `emailCampaignsInbound`, and the modified `emailCampaigns` to `lovable-marmot-864`; regenerates `convex/_generated`; exits 0. Commit any regenerated files:
```bash
git add convex/_generated
git commit -m "chore(email-campaigns): regenerate Convex API types for Plan 3 modules" --allow-empty
```

- [ ] **Step 5: Full automated suite + build**

Run: `npm test`
Expected: PASS — every test file (`business-hours`, `resend`, `emailCampaignsSending`, `emailCampaignsScheduling`, `emailCampaignsInbound`, the three route tests).

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: succeeds; `/unsubscribe` and the three `/api/email-campaigns/*` routes appear in the output.

- [ ] **Step 6: Local smoke test — approval → schedule → send**

This needs a real recipient. Use Daniel's own address so the send lands somewhere checkable.

1. `npm run dev` and `npx convex dev` (in separate terminals).
2. In the dashboard → Email Campaigns → Sequence: confirm the voice spec / briefs are filled enough to approve. The seeded **stub** voice spec makes the verifier flag every draft — that is fine, flags do not block approval. (If no enrollment exists, submit a Signal Score at `/` using Daniel's email + a real URL to generate one; wait for generation to finish → it lands in **Pending approval**.)
3. **Edit the lead's email** for the test enrollment to Daniel's inbox if it is not already (via the leads table / Convex dashboard).
4. Email Campaigns → overview: the kill switch ships **ON** (sending off). Toggle it **OFF**.
5. Open the enrollment → **Approve**. The orientation draft row should flip to **scheduled** with a send time ~2 minutes out.
6. Wait ~2 minutes. The orientation email should arrive in Daniel's inbox. The draft row flips to **sent**; an entry appears in **Recently sent**.
7. Confirm the email has the unsubscribe footer and that the visible "Unsubscribe" link points at `https://dreamfree.co.uk/unsubscribe?t=...`.

- [ ] **Step 7: Local smoke test — pause / resume / stop / unsubscribe**

1. On the same enrollment (now `approved`, backstory scheduled ~1 day out): click **Pause**. Backstory draft flips back to **draft**; enrollment is **paused**.
2. Click **Resume**. Backstory re-schedules; enrollment back to **approved**.
3. Click **Stop**. Scheduled draft cancelled; enrollment **stopped**.
4. In a browser, open the unsubscribe link from the received email (`/unsubscribe?t=...`). Expect the "You're unsubscribed" page. Verify in the dashboard: a row in `emailSuppressions` for that email, enrollment status **unsubscribed**.
5. Click **"I unsubscribed by accident"** → expect the confirmation text; verify the suppression row is gone and the enrollment is **paused**.
6. Re-open the same unsubscribe link → still shows "You're unsubscribed" (idempotent), no duplicate suppression row.

- [ ] **Step 8: Webhook verification (post-deploy or via tunnel)**

Resend cannot reach `localhost`. Either:
- **After deploying this branch** (preview or prod): in the Resend dashboard, use **Send test event** or send a real campaign email, then confirm the matching `emailSends` row gains `delivered`/`opened`/`clicked` status. Send to a known-bad address (e.g. `bounce@resend.dev` if available, or a non-existent mailbox) to confirm `bounced` → suppression + enrollment `unsubscribed` + next draft cancelled.
- **Or via a tunnel** (`ngrok http 3000` etc.): point a temporary Resend endpoint at the tunnel URL + `/api/email-campaigns/resend-webhook`.

Record the result here when done. If webhook testing is deferred to post-deploy, that is acceptable — note it in the PR description.

- [ ] **Step 9: Finish the branch**

Invoke **`superpowers:finishing-a-development-branch`** and follow it. Expected shape: open a PR from `email-campaigns-plan-3` into `master` (or merge per Daniel's preference). PR description should summarise the five-guard send chokepoint, the reactive scheduler, the webhook + unsubscribe surface, and explicitly state whether Step 8 (webhook) was verified locally or deferred to post-deploy.

- [ ] **Step 10: Post-merge deployment checklist (hand to Daniel)**

Not code — the steps to actually go live:
1. Set `RESEND_WEBHOOK_SIGNING_SECRET` on the **Convex prod** deployment and in **Vercel** production env.
2. Confirm `RESEND_API_KEY` and `UNSUBSCRIBE_SIGNING_SECRET` exist on Convex **prod**.
3. Deploy the branch (Vercel) and push Convex functions to prod (`npx convex deploy`).
4. Point the Resend webhook endpoint at the production URL with the five events.
5. Run `internal.emailCampaigns.seed` on prod if not already seeded (it is idempotent).
6. Leave the kill switch **ON** until Daniel has reviewed a real generated sequence end-to-end, then flip it off.

---

## Self-Review

Checked against the spec sections "Scheduler & sending", "Unsubscribe & suppression", "Configuration / env", "Testing strategy":

**Spec coverage:**
- On approval → schedule orientation only, business-hours clamp respected → Task 6. ✅
- Drafts 2–7 scheduled reactively, one at a time → `recordSendAndScheduleNext` (Task 4) + `sendDraft` (Task 5). ✅
- `sendDraft` five guards in order (kill switch → terminal → stale-cascade → suppression → send) → Task 5. ✅
- Kill switch reschedules +1h → `rescheduleDraftForKillSwitch` (Task 4), wired in Task 5. ✅
- Resend send with retries, `List-Unsubscribe` headers, tags, footer → Task 3, wired in Task 5. ✅
- On offer send → enrollment `completed` → `recordSendAndScheduleNext` (Task 4). ✅
- On send failure → draft `failed` → Task 4/5. ✅
- Pause / Resume / Stop scheduler semantics → Task 7. ✅
- Manual suppression cancels scheduled draft → Task 7 (`suppressEmail`). ✅
- Resend webhook handler — delivered/opened/clicked/bounced/complained, bounce+complaint suppress & cancel → `recordResendEvent` (Task 8) + Next.js route (Task 10). ✅
- `clampToBusinessHours` — Europe/London, BST/GMT, weekends, out-of-hours → Task 2. ✅
- Public `/unsubscribe` page, token-verified, idempotent, "by accident" undo → Tasks 9 + 11. ✅
- `List-Unsubscribe`/`List-Unsubscribe-Post` one-click POST endpoint → Task 11. ✅
- New env var `RESEND_WEBHOOK_SIGNING_SECRET`, Resend dashboard config → Task 12. ✅
- Testing strategy (guards, send chains, edit-cascade-at-send, webhook events, unsubscribe, business-hours) → covered by the test files in Tasks 2–11. ✅

**Known deviations from the spec (intentional, see "Design decisions locked" at the top):**
- `List-Unsubscribe` header points at `/api/email-campaigns/unsubscribe` (POST) while the footer link points at `/unsubscribe` (page) — the spec implied one URL, but an App Router page and route handler cannot share a path. Both carry the same token.
- `recordResendEvent` is a public mutation guarded by a shared secret rather than a Convex `httpAction`, because the spec mandates a Next.js route and svix verification needs the raw request.

**Deferred, matching the spec's own "Non-goals":** auto-pause on reply (manual pause only — `pauseEnrollment` reason `replied` already exists from Plan 2), score-band variants, `mailto:` unsubscribe form.

**Edge case noted, not fixed (acceptable for v1):** if `pauseEnrollment` runs while a `sendDraft` for the same enrollment is already mid-flight, `ctx.scheduler.cancel` cannot stop the in-flight run; that run sees `enrollment.status === "paused"` and marks its draft `skipped_terminal`. Resume then picks up the *next* draft, skipping one email. The window is sub-second and Daniel manages a handful of enrollments by hand — out of scope to fix here.

**Type consistency:** `scheduleDraftSend`/`cancelScheduledDraft` signatures are identical everywhere they are imported. `eventType` literals in `recordResendEvent` match the Next.js route's `EVENT_MAP` values. `SendCampaignEmailArgs` fields match the object `sendDraft` builds. `processUnsubscribe`/`undoUnsubscribe` return shapes match what the page and undo route consume.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-email-campaigns-plan-3-sending.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
