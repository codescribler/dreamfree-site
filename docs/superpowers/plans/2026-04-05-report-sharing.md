# Report Sharing & PDF Download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let verified report viewers share their Signal Score by email (capturing recipient emails as leads), download as PDF, and share on social media.

**Architecture:** Share-by-email stores share tokens on the report document and creates leads via a new API route. PDF uses `window.print()` with print CSS. Social sharing uses standard intent URLs. A sticky action bar and inline share form are added to the report page.

**Tech Stack:** Next.js API routes, Convex mutations, Resend email API, `@media print` CSS, client components.

**Spec:** `docs/superpowers/specs/2026-04-05-report-sharing-design.md`

---

### Task 1: Add shareTokens field to Convex schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add shareTokens to signalReports table**

In `convex/schema.ts`, add after the `clerkUserId` field (around line 130):

```typescript
shareTokens: v.optional(
  v.array(
    v.object({
      email: v.string(),
      token: v.string(),
      sharedBy: v.string(),
      createdAt: v.number(),
    }),
  ),
),
```

- [ ] **Step 2: Run Convex to validate schema**

Run: `npx convex dev` — check it starts without schema errors, then stop it.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add shareTokens field to signalReports schema"
```

---

### Task 2: Add Convex mutation for share tokens

**Files:**
- Modify: `convex/signalReports.ts`

- [ ] **Step 1: Add addShareToken mutation**

Add at the end of `convex/signalReports.ts`:

```typescript
export const addShareToken = mutation({
  args: {
    reportId: v.id("signalReports"),
    email: v.string(),
    token: v.string(),
    sharedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    const existing = report.shareTokens ?? [];
    await ctx.db.patch(args.reportId, {
      shareTokens: [
        ...existing,
        {
          email: args.email,
          token: args.token,
          sharedBy: args.sharedBy,
          createdAt: Date.now(),
        },
      ],
    });
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/signalReports.ts
git commit -m "feat: add addShareToken mutation"
```

---

### Task 3: Add share email action to Convex

**Files:**
- Modify: `convex/emails.ts`

- [ ] **Step 1: Add sendShareEmail action**

Add at the end of `convex/emails.ts`:

```typescript
/** Email a shared Signal Score report link to a recipient. */
export const sendShareEmail = action({
  args: {
    recipientEmail: v.string(),
    sharerName: v.string(),
    sharerMessage: v.optional(v.string()),
    url: v.string(),
    overallScore: v.number(),
    reportId: v.string(),
    shareToken: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping share email");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const magicLink = `${siteUrl}/report/${args.reportId}?share_token=${args.shareToken}`;
    const personalMessage = args.sharerMessage
      ? `<p style="margin:16px 0;padding:16px;background:#f5f4f0;border-radius:12px;font-style:italic;color:#444;">&ldquo;${args.sharerMessage}&rdquo;</p>`
      : "";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
        to: args.recipientEmail,
        subject: `${args.sharerName} shared a Signal Score report with you (${args.overallScore}/100)`,
        html: `
          <h2>Someone shared a Signal Score report with you</h2>
          <p><strong>${args.sharerName}</strong> thought you&rsquo;d find this useful &mdash; a website messaging audit for <strong>${args.url}</strong>, scored using The Signal Method.</p>
          ${personalMessage}
          <p>The site scored <strong>${args.overallScore} out of 100</strong> across seven key messaging elements.</p>
          <p><a href="${magicLink}" style="display:inline-block;padding:14px 28px;background:#0d7377;color:#fff;text-decoration:none;border-radius:60px;font-weight:600;font-size:15px;">View the Full Report</a></p>
          <hr style="border:none;border-top:1px solid #e2e1dc;margin:24px 0;" />
          <p style="color:#7b7b96;font-size:13px;">The Signal Method measures how clearly a website communicates to its ideal customer. It&rsquo;s built by <a href="https://dreamfree.co.uk">Dreamfree</a> &mdash; a web agency that builds websites people actually respond to.</p>
          <p style="color:#7b7b96;font-size:13px;">Want your own website scored? <a href="https://dreamfree.co.uk">Get a free Signal Score</a>.</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (share email):", error);
    }
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/emails.ts
git commit -m "feat: add sendShareEmail action for report sharing"
```

---

### Task 4: Create share API route

**Files:**
- Create: `app/api/report/[id]/share/route.ts`

- [ ] **Step 1: Create the share route**

Create `app/api/report/[id]/share/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { randomBytes } from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@") && e.includes("."));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { emails, message, sharerName, sharerEmail } = body as {
    emails: string;
    message?: string;
    sharerName: string;
    sharerEmail: string;
  };

  if (!emails || !sharerName || !sharerEmail) {
    return NextResponse.json(
      { error: "missing_fields", message: "Please fill in all required fields." },
      { status: 400 },
    );
  }

  const parsedEmails = parseEmails(emails);
  if (parsedEmails.length === 0) {
    return NextResponse.json(
      { error: "no_valid_emails", message: "Please enter at least one valid email address." },
      { status: 400 },
    );
  }

  if (parsedEmails.length > 10) {
    return NextResponse.json(
      { error: "too_many_emails", message: "You can share with up to 10 people at a time." },
      { status: 400 },
    );
  }

  // Fetch report
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

  // Process each recipient
  const results: { email: string; success: boolean }[] = [];

  for (const recipientEmail of parsedEmails) {
    try {
      const shareToken = randomBytes(32).toString("base64url");

      // Save share token on report
      await convex.mutation(api.signalReports.addShareToken, {
        reportId: id as Id<"signalReports">,
        email: recipientEmail,
        token: shareToken,
        sharedBy: sharerEmail,
      });

      // Create/upsert recipient as a lead
      await convex.mutation(api.leads.upsertLeadPublic, {
        email: recipientEmail,
        website: report.url,
        source: "shared_report",
      });

      // Send email
      await convex.action(api.emails.sendShareEmail, {
        recipientEmail,
        sharerName,
        sharerMessage: message || undefined,
        url: report.url,
        overallScore: report.overallScore,
        reportId: id,
        shareToken,
      });

      results.push({ email: recipientEmail, success: true });
    } catch (err) {
      console.error(`Share failed for ${recipientEmail}:`, err);
      results.push({ email: recipientEmail, success: false });
    }
  }

  // Send log email to Daniel
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const recipientList = results
      .map((r) => `${r.email} — ${r.success ? "sent" : "FAILED"}`)
      .join("<br />");

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dreamfree <notifications@dreamfree.co.uk>",
        to: "daniel@dreamfree.co.uk",
        subject: `[Share Log] ${sharerName} shared ${report.url} with ${parsedEmails.length} people`,
        html: `
          <h2>Report Shared</h2>
          <p><strong>Shared by:</strong> ${sharerName} (${sharerEmail})</p>
          <p><strong>Report:</strong> ${report.url} — ${report.overallScore}/100</p>
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
          <hr />
          <p><strong>Recipients:</strong></p>
          <p>${recipientList}</p>
        `,
      }),
    }).catch((err) => console.error("Share log email failed:", err));
  }

  const successCount = results.filter((r) => r.success).length;

  return NextResponse.json({
    success: true,
    count: successCount,
    message:
      successCount === parsedEmails.length
        ? `Report shared with ${successCount} ${successCount === 1 ? "person" : "people"}.`
        : `Shared with ${successCount} of ${parsedEmails.length} recipients. Some emails may have failed.`,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/report/[id]/share/route.ts
git commit -m "feat: add share API route with lead capture and logging"
```

---

### Task 5: Create ShareForm component

**Files:**
- Create: `components/report/ShareForm.tsx`

- [ ] **Step 1: Create the share form component**

Create `components/report/ShareForm.tsx`:

```typescript
"use client";

import { useState } from "react";

interface ShareFormProps {
  reportId: string;
  sharerName: string;
  sharerEmail: string;
  score: number;
}

export function ShareForm({
  reportId,
  sharerName,
  sharerEmail,
  score,
}: ShareFormProps) {
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emails.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/report/${reportId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: emails.trim(),
          message: message.trim() || undefined,
          sharerName,
          sharerEmail,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({ success: true, message: data.message });
        setEmails("");
        setMessage("");
      } else {
        setError(data.message || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      id="share-form"
      className="mt-10 rounded-2xl border border-border bg-warm-grey p-8 print:hidden"
      data-reveal
    >
      {score >= 60 && (
        <div className="mb-4 rounded-xl bg-teal/10 px-5 py-3 text-center">
          <p className="text-sm font-semibold text-teal-deep">
            Your site scored above average &mdash; share the good news!
          </p>
        </div>
      )}

      <h2 className="mb-2 text-lg font-bold text-charcoal">
        Share this report
      </h2>
      <p className="mb-6 text-[0.85rem] text-muted">
        Send the full report to a colleague, business partner, or marketing
        team. They&rsquo;ll get an email with a link to view everything you can
        see here.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="share-emails"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate"
          >
            Email addresses
          </label>
          <input
            id="share-emails"
            type="text"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="partner@example.com, marketing@example.com"
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-muted/50 focus:border-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted">
            Separate multiple addresses with commas.
          </p>
        </div>

        <div>
          <label
            htmlFor="share-message"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate"
          >
            Message (optional)
          </label>
          <textarea
            id="share-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Take a look at our website audit..."
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-muted/50 focus:border-teal focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !emails.trim()}
          className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-6 py-2.5 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? "Sending..." : "Share Report"}
        </button>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {result?.success && (
          <p className="text-sm font-medium text-teal-deep">
            {result.message}
          </p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/report/ShareForm.tsx
git commit -m "feat: add ShareForm component with email capture"
```

---

### Task 6: Create ReportActions sticky bar

**Files:**
- Create: `components/report/ReportActions.tsx`

- [ ] **Step 1: Create the action bar component**

Create `components/report/ReportActions.tsx`:

```typescript
"use client";

interface ReportActionsProps {
  reportUrl: string;
  score: number;
}

export function ReportActions({ reportUrl, score }: ReportActionsProps) {
  const shareText =
    score >= 60
      ? `My website scored ${score}/100 on The Signal Method audit — a messaging framework by Dreamfree.`
      : `Just got my website audited with The Signal Method by Dreamfree — scored ${score}/100.`;

  const encodedUrl = encodeURIComponent(reportUrl);
  const encodedText = encodeURIComponent(shareText);

  function handlePrint() {
    window.print();
  }

  function scrollToShare() {
    const el = document.getElementById("share-form");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Focus the email input after scrolling
      setTimeout(() => {
        const input = el.querySelector("input");
        input?.focus();
      }, 500);
    }
  }

  function openPopup(url: string) {
    window.open(url, "_blank", "width=600,height=500,noopener,noreferrer");
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm print:hidden">
      <div className="mx-auto flex max-w-[800px] items-center justify-center gap-3 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2">
        {/* Download PDF */}
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-[60px] border border-border bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PDF
        </button>

        {/* Share by Email */}
        <button
          onClick={scrollToShare}
          className="inline-flex items-center gap-2 rounded-[60px] border border-border bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Share by Email
        </button>

        {/* LinkedIn */}
        <button
          onClick={() =>
            openPopup(
              `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
            )
          }
          className="inline-flex items-center gap-2 rounded-[60px] border border-border bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          LinkedIn
        </button>

        {/* X / Twitter */}
        <button
          onClick={() =>
            openPopup(
              `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
            )
          }
          className="inline-flex items-center gap-2 rounded-[60px] border border-border bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post on X
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/report/ReportActions.tsx
git commit -m "feat: add ReportActions sticky bar with PDF, email, social share"
```

---

### Task 7: Add share_token verification to report page

**Files:**
- Modify: `app/report/[id]/page.tsx`

- [ ] **Step 1: Update searchParams type**

In `app/report/[id]/page.tsx`, change the searchParams type (around line 67):

```typescript
  searchParams: Promise<{ token?: string; share_token?: string }>;
```

- [ ] **Step 2: Destructure share_token**

Change the destructuring (around line 70):

```typescript
  const { token, share_token } = await searchParams;
```

- [ ] **Step 3: Add share_token check to access tier logic**

In the access tier block, add a `share_token` check after the existing `token` check. Replace the current access tier logic with:

```typescript
  // Determine access tier
  let tier: AccessTier = "public";
  const user = await currentUser();
  const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
  const isAdmin = userEmail === ADMIN_EMAIL;

  if (isAdmin) {
    tier = "verified";
  } else if (token && token === report.verifyToken) {
    // Magic link token — always grant access and set cookie
    await setVerificationCookie(id);
    if (report.accessLevel === "public") {
      await convex.mutation(api.signalReports.markVerified, {
        reportId: id as Id<"signalReports">,
      });
    }
    tier = "verified";
  } else if (
    share_token &&
    report.shareTokens?.some(
      (st: { token: string }) => st.token === share_token,
    )
  ) {
    // Share token — grant access and set cookie
    await setVerificationCookie(id);
    tier = "verified";
  } else {
    const hasCookie = await hasVerificationCookie(id);
    const isClerkOwner = report.clerkUserId && user?.id === report.clerkUserId;
    tier = hasCookie || isClerkOwner ? "verified" : "public";
  }
```

- [ ] **Step 4: Add imports for new components**

Add at the top of `app/report/[id]/page.tsx`:

```typescript
import { ShareForm } from "@/components/report/ShareForm";
import { ReportActions } from "@/components/report/ReportActions";
```

- [ ] **Step 5: Add ShareForm and ReportActions to the verified content section**

Inside the `{showVerified && ( ... )}` block, after the `<ReportCTA>` component (around line 298), add:

```typescript
          {/* Share form */}
          <ShareForm
            reportId={id}
            sharerName={lead?.firstName ?? ""}
            sharerEmail={lead?.email ?? ""}
            score={report.overallScore}
          />

          {/* Sticky action bar */}
          <ReportActions
            reportUrl={`${process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk"}/report/${id}`}
            score={report.overallScore}
          />
```

- [ ] **Step 6: Add bottom padding to report container**

The sticky action bar will overlap the bottom of the page. In the outermost div of the return (around line 138), add `pb-24` to the className:

Change:
```typescript
    <div className="mx-auto max-w-[800px] px-[clamp(1.25rem,4vw,3rem)] py-[clamp(3rem,6vw,5rem)]">
```

To:
```typescript
    <div className="mx-auto max-w-[800px] px-[clamp(1.25rem,4vw,3rem)] py-[clamp(3rem,6vw,5rem)] pb-24">
```

- [ ] **Step 7: Commit**

```bash
git add app/report/[id]/page.tsx
git commit -m "feat: integrate share form, action bar, and share_token verification"
```

---

### Task 8: Add print CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add @media print styles**

Add at the end of `app/globals.css`:

```css
/* ── Print styles ── */
@media print {
  /* Hide interactive/nav elements */
  header,
  footer,
  .print\\:hidden,
  [data-modal],
  .skip-link {
    display: none !important;
  }

  /* Reset background and colours */
  body {
    background: white !important;
    color: black !important;
    font-size: 12pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Ensure score ring colours print */
  svg {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Clean up cards for print */
  .rounded-2xl {
    break-inside: avoid;
  }

  /* Remove animations */
  * {
    animation: none !important;
    transition: none !important;
  }

  /* Print header */
  body::before {
    content: "Signal Score Report — dreamfree.co.uk";
    display: block;
    text-align: center;
    font-size: 10pt;
    color: #7b7b96;
    padding-bottom: 16pt;
    border-bottom: 1pt solid #e2e1dc;
    margin-bottom: 16pt;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: add print CSS for PDF download"
```

---

### Task 9: Push to production

- [ ] **Step 1: Push all commits**

```bash
git push origin master
```

- [ ] **Step 2: Verify build succeeds on Vercel**

Check the Vercel dashboard for a successful deployment.

- [ ] **Step 3: Remove debug endpoint**

Delete the temporary debug route and push:

```bash
rm app/api/debug/route.ts
git add app/api/debug/route.ts
git commit -m "chore: remove temporary debug endpoint"
git push origin master
```
