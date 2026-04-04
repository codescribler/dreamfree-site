# Report Access & Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clerk-gated report page with a three-tier access model (public → email-verified → paid via Stripe) so visitors see value immediately without account friction.

**Architecture:** The report page becomes a public server component that reads a verification cookie and the report's `accessLevel` to determine what to render. Email verification uses a 6-digit code + magic link token. Payment uses Stripe Checkout with a time-sensitive price (£7 within 1 hour, £27 after). Account creation happens only after payment.

**Tech Stack:** Next.js 16 App Router, Convex (mutations/queries via ConvexHttpClient), Stripe Checkout + Webhooks, Resend (email), HTTP-only signed cookies.

---

## File Structure

### New files
- `lib/report-cookie.ts` — sign/verify/set/read the verification cookie
- `app/api/report/[id]/verify/route.ts` — POST endpoint for manual code entry
- `app/api/report/[id]/checkout/route.ts` — POST endpoint to create Stripe Checkout session
- `app/api/webhooks/stripe/route.ts` — Stripe webhook handler
- `app/api/report/[id]/create-account/route.ts` — POST endpoint for post-payment Clerk account creation
- `components/report/VerifyPrompt.tsx` — code input + magic link hint (client component)
- `components/report/BuyPrompt.tsx` — price, countdown timer, Stripe checkout button (client component)
- `components/report/CreateAccountPrompt.tsx` — post-payment password setup (client component)

### Modified files
- `convex/schema.ts` — add new fields to `signalReports` table
- `convex/signalReports.ts` — add `verifyCode`, `verifyToken` to `saveReport`; add `setFirstViewed`, `markPaid`, `linkClerkUser` mutations; add `getByIdWithLead` query
- `convex/emails.ts` — update `sendSignalScoreToVisitor` to include magic link and code
- `app/api/signal-score/route.ts` — generate verifyCode + verifyToken, pass to `saveReport` and email
- `app/report/[id]/page.tsx` — rewrite: remove Clerk auth gate, add cookie-based tier detection, render tier-appropriate content
- `components/report/PaywallOverlay.tsx` — delete (replaced by BuyPrompt)

### Unchanged files (used as-is)
- `components/report/ScoreRing.tsx`
- `components/report/GruntTestBadge.tsx`
- `components/report/ElementCard.tsx` (minor prop changes)

---

### Task 1: Update Convex Schema

**Files:**
- Modify: `convex/schema.ts:56-126`

- [ ] **Step 1: Update the `signalReports` table definition**

In `convex/schema.ts`, replace the `signalReports` table definition (lines 56–126) with:

```typescript
  signalReports: defineTable({
    leadId: v.id("leads"),
    anonymousId: v.string(),
    url: v.string(),
    customerDescription: v.string(),
    overallScore: v.number(),
    gruntTest: v.object({
      pass: v.boolean(),
      explanation: v.string(),
    }),
    elements: v.object({
      character: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        recommendation: v.string(),
      }),
      problem: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        recommendation: v.string(),
      }),
      guide: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        recommendation: v.string(),
      }),
      plan: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        recommendation: v.string(),
      }),
      cta: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        recommendation: v.string(),
      }),
      stakes: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        recommendation: v.string(),
      }),
      transformation: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        recommendation: v.string(),
      }),
    }),
    quickWin: v.string(),
    strengths: v.array(v.string()),
    fullSummary: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("fetch_failed"),
      v.literal("llm_failed"),
      v.literal("rate_limited"),
    ),
    accessLevel: v.union(
      v.literal("public"),
      v.literal("verified"),
      v.literal("paid"),
    ),
    verifyCode: v.string(),
    verifyToken: v.string(),
    firstViewedAt: v.optional(v.number()),
    stripeSessionId: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    paidAmount: v.optional(v.number()),
    clerkUserId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_leadId", ["leadId"])
    .index("by_anonymousId", ["anonymousId"])
    .index("by_url", ["url"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"]),
```

- [ ] **Step 2: Verify schema pushes**

Run: `npx convex dev --once`
Expected: Schema push succeeds. If there are existing documents with `accessLevel: "locked"`, you may need to clear the dev database or run a migration. For dev, clearing is fine.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: update signalReports schema for three-tier access model"
```

---

### Task 2: Update Convex signalReports Functions

**Files:**
- Modify: `convex/signalReports.ts`

- [ ] **Step 1: Update `saveReport` to accept verification fields**

Replace the `saveReport` mutation with:

```typescript
/** Save a complete signal report. */
export const saveReport = mutation({
  args: {
    leadId: v.id("leads"),
    anonymousId: v.string(),
    url: v.string(),
    customerDescription: v.string(),
    overallScore: v.number(),
    gruntTest: v.object({
      pass: v.boolean(),
      explanation: v.string(),
    }),
    elements: elementsValidator,
    quickWin: v.string(),
    strengths: v.array(v.string()),
    fullSummary: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("fetch_failed"),
      v.literal("llm_failed"),
      v.literal("rate_limited"),
    ),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("signalReports", {
      ...args,
      accessLevel: "public",
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Update `saveFailedReport` to include verification fields**

Replace the `saveFailedReport` mutation with:

```typescript
/** Save a failed or rate-limited report (minimal data). */
export const saveFailedReport = mutation({
  args: {
    leadId: v.id("leads"),
    anonymousId: v.string(),
    url: v.string(),
    customerDescription: v.string(),
    status: v.union(
      v.literal("fetch_failed"),
      v.literal("llm_failed"),
      v.literal("rate_limited"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("signalReports", {
      leadId: args.leadId,
      anonymousId: args.anonymousId,
      url: args.url,
      customerDescription: args.customerDescription,
      overallScore: 0,
      gruntTest: { pass: false, explanation: "" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: args.status,
      accessLevel: "public",
      verifyCode: "",
      verifyToken: "",
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Add new mutations for verification, payment, and account linking**

Add these after the existing `unlock` mutation (which can be removed or kept for admin use):

```typescript
/** Record the first time a visitor views the report page. */
export const setFirstViewed = mutation({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (report && !report.firstViewedAt) {
      await ctx.db.patch(args.reportId, { firstViewedAt: Date.now() });
    }
  },
});

/** Mark a report as verified (email code confirmed). */
export const markVerified = mutation({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (report && report.accessLevel === "public") {
      await ctx.db.patch(args.reportId, { accessLevel: "verified" });
    }
  },
});

/** Mark a report as paid after Stripe webhook. */
export const markPaid = mutation({
  args: {
    reportId: v.id("signalReports"),
    stripeSessionId: v.string(),
    paidAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (report) {
      await ctx.db.patch(args.reportId, {
        accessLevel: "paid",
        stripeSessionId: args.stripeSessionId,
        paidAmount: args.paidAmount,
        paidAt: Date.now(),
      });
    }
  },
});

/** Link a Clerk user ID to a report after post-payment account creation. */
export const linkClerkUser = mutation({
  args: {
    reportId: v.id("signalReports"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, { clerkUserId: args.clerkUserId });
  },
});

/** Get a report with its associated lead (for the report page). */
export const getByIdWithLead = query({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    const lead = await ctx.db.get(report.leadId);
    return { report, lead };
  },
});
```

Also add the `query` import at the top if not already there (it is already imported).

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add convex/signalReports.ts
git commit -m "feat: add verification, payment, and account-linking mutations"
```

---

### Task 3: Create the Cookie Signing Library

**Files:**
- Create: `lib/report-cookie.ts`

- [ ] **Step 1: Create the cookie utility**

```typescript
import { cookies } from "next/headers";
import { createHmac } from "crypto";

const SECRET = process.env.REPORT_SIGNING_SECRET || "dev-secret-change-me";

function sign(reportId: string): string {
  const payload = JSON.stringify({ reportId, ts: Date.now() });
  const signature = createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

function verify(token: string, reportId: string): boolean {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return false;
  try {
    const payload = Buffer.from(payloadB64, "base64url").toString();
    const expected = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");
    if (signature !== expected) return false;
    const data = JSON.parse(payload);
    return data.reportId === reportId;
  } catch {
    return false;
  }
}

const COOKIE_PREFIX = "df_report_";

export async function setVerificationCookie(reportId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(`${COOKIE_PREFIX}${reportId}`, sign(reportId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/report/${reportId}`,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export async function hasVerificationCookie(
  reportId: string,
): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(`${COOKIE_PREFIX}${reportId}`);
  if (!cookie) return false;
  return verify(cookie.value, reportId);
}
```

- [ ] **Step 2: Add `REPORT_SIGNING_SECRET` to env files**

In `.env.local`, add:
```
REPORT_SIGNING_SECRET=change-me-to-a-random-string
```

In `.env.local.example`, add:
```
# Report verification cookie signing
REPORT_SIGNING_SECRET=
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/report-cookie.ts .env.local.example
git commit -m "feat: add signed cookie utility for report verification"
```

---

### Task 4: Update the Signal Score API Route

**Files:**
- Modify: `app/api/signal-score/route.ts`

- [ ] **Step 1: Add code and token generation**

At the top of the file, after the existing imports, add:

```typescript
import { randomInt, randomBytes } from "crypto";
```

- [ ] **Step 2: Generate verification credentials and pass to saveReport**

In the success path (around line 206–220), replace the `saveReport` call and email calls. Find this section:

```typescript
  const reportId = await convex.mutation(api.signalReports.saveReport, {
    leadId,
    anonymousId,
    url,
    customerDescription,
    overallScore,
    gruntTest: llmResult.gruntTest,
    elements: llmResult.elements,
    quickWin: llmResult.quickWin,
    strengths: llmResult.strengths,
    fullSummary: llmResult.fullSummary,
    status: "success",
  });
```

Replace with:

```typescript
  // Generate verification credentials
  const verifyCode = String(randomInt(100000, 999999));
  const verifyToken = randomBytes(32).toString("base64url");

  const reportId = await convex.mutation(api.signalReports.saveReport, {
    leadId,
    anonymousId,
    url,
    customerDescription,
    overallScore,
    gruntTest: llmResult.gruntTest,
    elements: llmResult.elements,
    quickWin: llmResult.quickWin,
    strengths: llmResult.strengths,
    fullSummary: llmResult.fullSummary,
    status: "success",
    verifyCode,
    verifyToken,
  });
```

- [ ] **Step 3: Update the visitor email call to include verification data**

Find the `sendSignalScoreToVisitor` call and replace with:

```typescript
  convex
    .action(api.emails.sendSignalScoreToVisitor, {
      firstName,
      email,
      url,
      overallScore,
      gruntTestPass: llmResult.gruntTest.pass,
      reportId: reportId as string,
      verifyCode,
      verifyToken,
    })
    .catch((err) => console.error("Visitor email failed:", err));
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: Errors in `emails.ts` because we haven't updated the email function args yet. That's Task 5.

- [ ] **Step 5: Commit**

```bash
git add app/api/signal-score/route.ts
git commit -m "feat: generate verify code and token in signal score API"
```

---

### Task 5: Update the Visitor Email

**Files:**
- Modify: `convex/emails.ts:54-106`

- [ ] **Step 1: Update `sendSignalScoreToVisitor` args and email content**

Replace the entire `sendSignalScoreToVisitor` action with:

```typescript
/** Email the visitor their Signal Score results with verification link and code. */
export const sendSignalScoreToVisitor = action({
  args: {
    firstName: v.string(),
    email: v.string(),
    url: v.string(),
    overallScore: v.number(),
    gruntTestPass: v.boolean(),
    reportId: v.string(),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping visitor email");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const magicLink = `${siteUrl}/report/${args.reportId}?token=${args.verifyToken}`;
    const gruntResult = args.gruntTestPass
      ? "Your site <strong>passed</strong> the Grunt Test."
      : "Your site <strong>did not pass</strong> the Grunt Test — most visitors can't tell what you do within 5 seconds.";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
        to: args.email,
        subject: `${args.firstName}, your Signal Score is ${args.overallScore}/100`,
        html: `
          <h2>Your Signal Score: ${args.overallScore}/100</h2>
          <p>Hi ${args.firstName},</p>
          <p>We've just analysed <strong>${args.url}</strong> against the StoryBrand messaging framework — the same framework used by thousands of businesses to clarify their message and convert more visitors.</p>
          <p>${gruntResult}</p>
          <p>Your full element-by-element breakdown is ready:</p>
          <p><a href="${magicLink}" style="display:inline-block;padding:14px 28px;background:#0d7377;color:#fff;text-decoration:none;border-radius:60px;font-weight:600;font-size:15px;">See Your Full Breakdown</a></p>
          <p style="color:#7b7b96;font-size:13px;margin-top:16px;">If the button doesn't work, enter this code on the report page:</p>
          <p style="font-size:24px;font-weight:800;letter-spacing:4px;color:#1a1a2e;text-align:center;padding:12px;background:#f5f4f0;border-radius:12px;">${args.verifyCode}</p>
          <hr style="border:none;border-top:1px solid #e2e1dc;margin:24px 0;" />
          <p style="color:#7b7b96;font-size:13px;">This is your Signal Score — how clearly your website communicates to your ideal customer. It's the first element of The Signal Method, and it's the one that matters most.</p>
          <p style="color:#7b7b96;font-size:13px;">Questions? Just reply to this email — it comes straight to me.</p>
          <p style="color:#7b7b96;font-size:13px;">— Daniel Whittaker, Dreamfree</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (visitor email):", error);
    }
  },
});
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add convex/emails.ts
git commit -m "feat: include magic link and verify code in visitor email"
```

---

### Task 6: Create the Verify API Endpoint

**Files:**
- Create: `app/api/report/[id]/verify/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { setVerificationCookie } from "@/lib/report-cookie";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { code } = body as { code: string };

  if (!code || code.length !== 6) {
    return NextResponse.json(
      { error: "invalid_code", message: "Please enter a 6-digit code." },
      { status: 400 },
    );
  }

  let report;
  try {
    report = await convex.query(api.signalReports.getById, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!report || report.status !== "success") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (report.verifyCode !== code) {
    return NextResponse.json(
      { error: "wrong_code", message: "That code doesn't match. Check your email and try again." },
      { status: 403 },
    );
  }

  // Mark as verified in Convex if still public
  if (report.accessLevel === "public") {
    await convex.mutation(api.signalReports.markVerified, {
      reportId: id as Id<"signalReports">,
    });
  }

  // Set verification cookie
  await setVerificationCookie(id);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/report/[id]/verify/route.ts
git commit -m "feat: add report verification endpoint"
```

---

### Task 7: Install Stripe and Create Checkout Endpoint

**Files:**
- Create: `app/api/report/[id]/checkout/route.ts`

- [ ] **Step 1: Install the Stripe SDK**

Run: `npm install stripe`

- [ ] **Step 2: Create the checkout endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const EARLY_BIRD_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let data;
  try {
    data = await convex.query(api.signalReports.getByIdWithLead, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!data || !data.report || data.report.status !== "success") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (data.report.accessLevel === "paid") {
    return NextResponse.json({ error: "already_paid" }, { status: 400 });
  }

  // Determine price based on firstViewedAt
  const now = Date.now();
  const firstViewed = data.report.firstViewedAt ?? now;
  const isEarlyBird = now - firstViewed < EARLY_BIRD_WINDOW_MS;
  const priceId = isEarlyBird
    ? process.env.STRIPE_PRICE_EARLY!
    : process.env.STRIPE_PRICE_STANDARD!;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: data.lead?.email,
    metadata: { reportId: id },
    client_reference_id: id,
    success_url: `${siteUrl}/report/${id}?paid=1`,
    cancel_url: `${siteUrl}/report/${id}`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 3: Add Stripe env vars**

In `.env.local`, add:
```
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
STRIPE_PRICE_EARLY=price_your_early_id
STRIPE_PRICE_STANDARD=price_your_standard_id
```

In `.env.local.example`, add:
```
# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_EARLY=
STRIPE_PRICE_STANDARD=
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/report/[id]/checkout/route.ts .env.local.example package.json package-lock.json
git commit -m "feat: add Stripe Checkout endpoint for report payment"
```

---

### Task 8: Create the Stripe Webhook Handler

**Files:**
- Create: `app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Create the webhook endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const reportId = session.metadata?.reportId;

    if (reportId) {
      const amountTotal = session.amount_total ?? 0; // in pence

      await convex.mutation(api.signalReports.markPaid, {
        reportId: reportId as Id<"signalReports">,
        stripeSessionId: session.id,
        paidAmount: amountTotal,
      });
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe webhook handler for payment completion"
```

---

### Task 9: Create the VerifyPrompt Component

**Files:**
- Create: `components/report/VerifyPrompt.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";

interface VerifyPromptProps {
  reportId: string;
}

export function VerifyPrompt({ reportId }: VerifyPromptProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/report/${reportId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        window.location.reload();
        return;
      }

      setError(data.message || "Invalid code. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="my-10 rounded-2xl border border-border bg-warm-grey p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal/10">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="text-teal"
        >
          <path
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="mb-2 text-lg font-bold text-charcoal">
        Unlock Your Score Breakdown
      </h3>
      <p className="mb-6 text-[0.9rem] text-slate">
        We&rsquo;ve sent a code to your email. Enter it below to see how each
        of the 7 messaging elements scored.
      </p>
      <form onSubmit={handleSubmit} className="mx-auto max-w-xs">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="Enter 6-digit code"
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-center text-lg font-semibold tracking-[0.3em] text-charcoal placeholder:text-muted placeholder:tracking-normal focus:border-teal focus:outline-none"
          disabled={loading}
        />
        {error && (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="mt-4 w-full rounded-[60px] bg-teal px-6 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>
      <p className="mt-4 text-xs text-muted">
        Or check your email for a magic link — click it and you&rsquo;re in.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/report/VerifyPrompt.tsx
git commit -m "feat: add VerifyPrompt component for report email verification"
```

---

### Task 10: Create the BuyPrompt Component

**Files:**
- Create: `components/report/BuyPrompt.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useEffect } from "react";

interface BuyPromptProps {
  reportId: string;
  firstViewedAt: number;
}

const EARLY_BIRD_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function BuyPrompt({ reportId, firstViewedAt }: BuyPromptProps) {
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => {
    const remaining = EARLY_BIRD_WINDOW_MS - (Date.now() - firstViewedAt);
    return Math.max(0, remaining);
  });

  const isEarlyBird = timeLeft > 0;

  useEffect(() => {
    if (!isEarlyBird) return;
    const interval = setInterval(() => {
      const remaining = EARLY_BIRD_WINDOW_MS - (Date.now() - firstViewedAt);
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [firstViewedAt, isEarlyBird]);

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  async function handleCheckout() {
    setLoading(true);
    try {
      const res = await fetch(`/api/report/${reportId}/checkout`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="my-10 rounded-2xl border border-border bg-warm-grey p-8 text-center">
      <h3 className="mb-2 text-lg font-bold text-charcoal">
        Unlock Your Full Report
      </h3>
      <p className="mb-4 text-[0.9rem] text-slate">
        Get detailed analysis and actionable recommendations for every element
        — a complete messaging blueprint you can act on today.
      </p>

      {isEarlyBird && (
        <div className="mb-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal/10 px-4 py-1.5 text-xs font-semibold text-teal-deep">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="text-teal"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 6v6l4 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Early bird price expires in {minutes}:{String(seconds).padStart(2, "0")}
          </span>
        </div>
      )}

      <div className="mb-6">
        {isEarlyBird ? (
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-3xl font-black text-charcoal">&pound;7</span>
            <span className="text-sm text-muted line-through">&pound;27</span>
          </div>
        ) : (
          <span className="text-3xl font-black text-charcoal">&pound;27</span>
        )}
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {loading ? "Redirecting to checkout..." : isEarlyBird ? "Unlock for \u00A37" : "Unlock for \u00A327"}
      </button>

      <p className="mt-4 text-xs text-muted">
        Secure payment via Stripe. Instant access after payment.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/report/BuyPrompt.tsx
git commit -m "feat: add BuyPrompt component with countdown timer"
```

---

### Task 11: Create the CreateAccountPrompt Component

**Files:**
- Create: `components/report/CreateAccountPrompt.tsx`
- Create: `app/api/report/[id]/create-account/route.ts`

- [ ] **Step 1: Create the API endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { password } = body as { password: string };

  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  // Get the report and lead to find the email
  let data;
  try {
    data = await convex.query(api.signalReports.getByIdWithLead, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!data?.report || !data?.lead || data.report.accessLevel !== "paid") {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  if (data.report.clerkUserId) {
    return NextResponse.json({ error: "account_exists" }, { status: 400 });
  }

  try {
    const clerk = await clerkClient();
    const user = await clerk.users.createUser({
      emailAddress: [data.lead.email],
      password,
      firstName: data.lead.firstName || undefined,
    });

    await convex.mutation(api.signalReports.linkClerkUser, {
      reportId: id as Id<"signalReports">,
      clerkUserId: user.id,
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create account.";
    console.error("Clerk account creation failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the component**

```tsx
"use client";

import { useState } from "react";

interface CreateAccountPromptProps {
  reportId: string;
  email: string;
}

export function CreateAccountPrompt({
  reportId,
  email,
}: CreateAccountPromptProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/report/${reportId}/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        setDone(true);
        return;
      }

      setError(data.error || "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="my-10 rounded-2xl border border-teal/20 bg-teal-glow p-8 text-center">
        <h3 className="mb-2 text-lg font-bold text-charcoal">
          Account created
        </h3>
        <p className="text-[0.9rem] text-slate">
          You can now sign in with <strong>{email}</strong> to access your
          report from any device.
        </p>
      </div>
    );
  }

  return (
    <div className="my-10 rounded-2xl border border-border bg-warm-grey p-8 text-center">
      <h3 className="mb-2 text-lg font-bold text-charcoal">
        Save Your Access
      </h3>
      <p className="mb-6 text-[0.9rem] text-slate">
        Create a password so you can access your full report from any device.
      </p>
      <form onSubmit={handleSubmit} className="mx-auto max-w-xs">
        <input
          type="email"
          value={email}
          readOnly
          className="mb-3 w-full rounded-xl border border-border bg-white/60 px-4 py-3 text-center text-sm text-muted"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a password (8+ chars)"
          minLength={8}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-center text-sm text-charcoal placeholder:text-muted focus:border-teal focus:outline-none"
          disabled={loading}
        />
        {error && (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || password.length < 8}
          className="mt-4 w-full rounded-[60px] bg-teal px-6 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? "Creating account..." : "Save My Access"}
        </button>
      </form>
      <p className="mt-3 text-xs text-muted">
        You can skip this — your report will stay accessible in this browser.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/report/CreateAccountPrompt.tsx app/api/report/[id]/create-account/route.ts
git commit -m "feat: add post-payment account creation flow"
```

---

### Task 12: Rewrite the Report Page

**Files:**
- Modify: `app/report/[id]/page.tsx` (full rewrite)
- Delete: `components/report/PaywallOverlay.tsx`

- [ ] **Step 1: Rewrite the report page**

Replace the entire contents of `app/report/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { buildMetadata } from "@/lib/metadata";
import { hasVerificationCookie, setVerificationCookie } from "@/lib/report-cookie";
import { ScoreRing } from "@/components/report/ScoreRing";
import { ElementCard } from "@/components/report/ElementCard";
import { GruntTestBadge } from "@/components/report/GruntTestBadge";
import { VerifyPrompt } from "@/components/report/VerifyPrompt";
import { BuyPrompt } from "@/components/report/BuyPrompt";
import { CreateAccountPrompt } from "@/components/report/CreateAccountPrompt";
import { SITE } from "@/lib/constants";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const ADMIN_EMAIL = "daniel@dreamfree.co.uk";

const ELEMENT_NAMES: Record<string, string> = {
  character: "Character (The Hero)",
  problem: "Problem",
  guide: "Guide (Credibility)",
  plan: "Plan",
  cta: "Call to Action",
  stakes: "Stakes (Failure)",
  transformation: "Transformation (Success)",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return buildMetadata({
    title: "Signal Score Report",
    description:
      "Your personalised website messaging audit based on the StoryBrand framework.",
    path: `/report/${id}`,
  });
}

type AccessTier = "public" | "verified" | "paid";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; paid?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  // Fetch the report with lead data
  let data;
  try {
    data = await convex.query(api.signalReports.getByIdWithLead, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    notFound();
  }

  if (!data?.report || data.report.status !== "success") {
    notFound();
  }

  const { report, lead } = data;

  // Record first view (fire and forget)
  if (!report.firstViewedAt) {
    convex
      .mutation(api.signalReports.setFirstViewed, {
        reportId: id as Id<"signalReports">,
      })
      .catch(() => {});
  }

  // Determine access tier
  let tier: AccessTier = "public";

  // Check admin
  const user = await currentUser();
  const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
  const isAdmin = userEmail === ADMIN_EMAIL;

  if (isAdmin) {
    tier = "paid"; // Admin sees everything
  } else if (report.accessLevel === "paid") {
    // Report is paid — show full content if they have a cookie or are the Clerk user
    const hasCookie = await hasVerificationCookie(id);
    const isClerkOwner = report.clerkUserId && user?.id === report.clerkUserId;
    if (hasCookie || isClerkOwner) {
      tier = "paid";
    } else {
      // They paid but are on a different browser with no cookie — verify first
      tier = "public";
    }
  } else if (report.accessLevel === "verified") {
    const hasCookie = await hasVerificationCookie(id);
    tier = hasCookie ? "verified" : "public";
  } else {
    // Check magic link token
    if (token && token === report.verifyToken) {
      await setVerificationCookie(id);
      // Mark as verified if still public
      if (report.accessLevel === "public") {
        await convex.mutation(api.signalReports.markVerified, {
          reportId: id as Id<"signalReports">,
        });
      }
      tier = "verified";
    } else {
      const hasCookie = await hasVerificationCookie(id);
      tier = hasCookie ? "verified" : "public";
    }
  }

  const showVerified = tier === "verified" || tier === "paid";
  const showPaid = tier === "paid";

  // Show account creation prompt if paid but no Clerk account linked
  const showCreateAccount =
    report.accessLevel === "paid" && !report.clerkUserId && !isAdmin;

  const reportDate = new Date(report.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const firstViewedAt = report.firstViewedAt ?? Date.now();

  const elementEntries = Object.entries(report.elements) as [
    string,
    {
      score: number;
      summary: string;
      analysis: string;
      recommendation: string;
    },
  ][];

  return (
    <div className="mx-auto max-w-[800px] px-[clamp(1.25rem,4vw,3rem)] py-[clamp(3rem,6vw,5rem)]">
      {/* Header */}
      <div className="mb-10 text-center" data-reveal>
        <span className="mb-3 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
          Signal Score Report
        </span>
        <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold tracking-tight text-charcoal">
          {report.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </h1>
        <p className="mt-2 text-sm text-muted">{reportDate}</p>
      </div>

      {/* Score ring — PUBLIC */}
      <div className="mb-10 flex justify-center" data-reveal>
        <ScoreRing score={report.overallScore} size={220} />
      </div>

      {/* Grunt Test — PUBLIC */}
      <div className="mb-10" data-reveal>
        <GruntTestBadge
          pass={report.gruntTest.pass}
          explanation={report.gruntTest.explanation}
        />
      </div>

      {/* Quick Win — PUBLIC */}
      <div
        className="mb-10 rounded-2xl border border-border bg-warm-grey p-8"
        data-reveal
      >
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-teal-deep">
          Your #1 Quick Win
        </h2>
        <p className="text-[0.95rem] leading-[1.8] text-slate">
          {report.quickWin}
        </p>
      </div>

      {/* Verify prompt — shown when NOT verified */}
      {!showVerified && <VerifyPrompt reportId={id} />}

      {/* Strengths — VERIFIED */}
      {showVerified && report.strengths.length > 0 && (
        <div className="mb-10" data-reveal>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            What your site does well
          </h2>
          <ul className="space-y-2">
            {report.strengths.map((strength: string, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="mt-0.5 shrink-0 text-teal"
                >
                  <path
                    d="M9 12l2 2 4-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[0.9rem] leading-[1.6] text-slate">
                  {strength}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Element breakdown — VERIFIED (scores + summaries), PAID (full) */}
      {showVerified && (
        <div className="mb-4" data-reveal>
          <h2 className="mb-6 text-lg font-bold text-charcoal">
            Element-by-element breakdown
          </h2>
          <div className="space-y-4">
            {elementEntries.map(([key, el]) => (
              <ElementCard
                key={key}
                name={ELEMENT_NAMES[key] || key}
                score={el.score}
                summary={el.summary}
                analysis={showPaid ? el.analysis : undefined}
                recommendation={showPaid ? el.recommendation : undefined}
                locked={!showPaid}
              />
            ))}
          </div>
        </div>
      )}

      {/* Buy prompt — shown when VERIFIED but NOT paid */}
      {showVerified && !showPaid && (
        <BuyPrompt reportId={id} firstViewedAt={firstViewedAt} />
      )}

      {/* Full summary — PAID only */}
      {showPaid && report.fullSummary && (
        <div
          className="mb-10 rounded-2xl border border-border bg-warm-grey p-8"
          data-reveal
        >
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            Overall Assessment
          </h2>
          <p className="text-[0.95rem] leading-[1.8] text-slate">
            {report.fullSummary}
          </p>
        </div>
      )}

      {/* Create account prompt — shown after payment if no account */}
      {showCreateAccount && (
        <CreateAccountPrompt reportId={id} email={lead?.email ?? ""} />
      )}

      {/* Footer CTA */}
      <div className="mt-12 text-center" data-reveal>
        <h2 className="mb-3 text-xl font-bold text-charcoal">
          Want someone to fix this for you?
        </h2>
        <p className="mb-6 text-[0.95rem] text-slate">
          Daniel can walk you through your report and show you what your site
          could look like with these changes applied.
        </p>
        <a
          href={SITE.phoneTel}
          className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
        >
          Call Daniel — {SITE.phone}
        </a>
        <p className="mt-3 text-xs text-muted">
          Or{" "}
          <a
            href={`mailto:${SITE.email}?subject=My Signal Score report`}
            className="font-semibold text-teal transition-colors hover:text-teal-deep"
          >
            email Daniel
          </a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete `PaywallOverlay.tsx`**

Run: `rm components/report/PaywallOverlay.tsx`

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/report/[id]/page.tsx
git rm components/report/PaywallOverlay.tsx
git commit -m "feat: rewrite report page with three-tier access model"
```

---

### Task 13: End-to-End Smoke Test

- [ ] **Step 1: Start Convex dev**

Run in a separate terminal: `npx convex dev`
Expected: Schema pushes successfully with the new fields.

- [ ] **Step 2: Start Next.js dev**

Run in a separate terminal: `npm run dev`
Expected: Compiles without errors.

- [ ] **Step 3: Test the public tier**

1. Open the site, click a "Get My Signal Score" CTA
2. Fill in URL, customer description, name, email
3. Wait for analysis to complete
4. Confirm you're redirected to `/report/[id]`
5. Confirm you see: score ring, grunt test, quick win, verify prompt
6. Confirm you do NOT see: strengths, element breakdown, buy prompt

- [ ] **Step 4: Test the verified tier (manual code)**

1. Check the Convex dashboard for the report's `verifyCode`
2. Enter the code in the verify prompt
3. Confirm the page reloads and now shows: strengths, element scores with summaries, buy prompt
4. Confirm element analysis and recommendations are blurred/locked

- [ ] **Step 5: Test the verified tier (magic link)**

1. Open a new incognito window
2. In the Convex dashboard, find the report's `verifyToken`
3. Navigate to `/report/[id]?token=[verifyToken]`
4. Confirm you see the verified tier immediately

- [ ] **Step 6: Test the Stripe checkout flow**

1. Click the "Unlock" button on the buy prompt
2. Confirm you're redirected to Stripe Checkout with the correct price
3. Complete payment with Stripe test card `4242 4242 4242 4242`
4. Confirm you're redirected back to the report with full content visible
5. Confirm the create account prompt appears

Note: For the webhook to work locally, you need `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. Install the Stripe CLI if needed: `npm install -g stripe` or download from stripe.com/docs/stripe-cli.

- [ ] **Step 7: Test admin access**

1. Sign in as daniel@dreamfree.co.uk via `/sign-in`
2. Navigate to any report
3. Confirm you see everything — no verify prompt, no buy prompt
