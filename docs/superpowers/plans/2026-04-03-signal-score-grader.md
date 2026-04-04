# Signal Score Grader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake Signal Score grader with a real AI-powered website messaging audit that scores against the StoryBrand SB7 framework via OpenRouter, captures leads with email, stores full reports in Convex, gates report access behind Clerk auth and payment tiers, and rate-limits to 3 free uses.

**Architecture:** Next.js API route handles HTML fetching and OpenRouter LLM calls. Convex stores reports, leads, and handles rate-limit counting. Clerk gates the report page. Resend sends notification emails. The SignalFlow modal component is updated with a new email step and real API integration.

**Tech Stack:** Next.js 15, TypeScript, Convex, Clerk, OpenRouter (Gemini 2.0 Flash), Resend, Tailwind CSS

**Reference:** Design spec at `docs/superpowers/specs/2026-04-03-signal-score-grader-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `lib/signal-prompt.ts` | LLM system prompt for SB7 scoring |
| `lib/html-stripper.ts` | Extract meaningful text content from raw HTML |
| `app/api/signal-score/route.ts` | API route: rate limit check, fetch HTML, call OpenRouter, save results |
| `convex/signalReports.ts` | Convex mutations/queries for signal reports table |
| `app/report/[id]/page.tsx` | Report page with tiered access control |
| `components/report/ScoreRing.tsx` | Reusable animated score ring |
| `components/report/ElementCard.tsx` | Score card for each SB7 element |
| `components/report/GruntTestBadge.tsx` | Grunt Test pass/fail badge |
| `components/report/PaywallOverlay.tsx` | Blur overlay with unlock CTA |

### Modified files
| File | What changes |
|------|-------------|
| `convex/schema.ts` | Add `signalReports` table definition |
| `convex/formSubmissions.ts` | Update `submitSignalScore` to accept email and create leads |
| `convex/emails.ts` | Add signal score notification emails (visitor + Daniel) |
| `components/signal-flow/SignalFlow.tsx` | New email step, real API call, uses-remaining display, limit screen |
| `.env.local.example` | Add `OPENROUTER_API_KEY` |

---

## Phase 1: Backend Foundation

### Task 1: Add `signalReports` table to Convex schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the signalReports table definition**

In `convex/schema.ts`, add the following table inside `defineSchema({})`, after the `formSubmissions` table:

```ts
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
    accessLevel: v.union(v.literal("locked"), v.literal("unlocked")),
    createdAt: v.number(),
  })
    .index("by_leadId", ["leadId"])
    .index("by_anonymousId", ["anonymousId"])
    .index("by_url", ["url"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"]),
```

- [ ] **Step 2: Verify schema compiles**

Run: `cd dreamfree-site && npx convex dev --once`

Expected: Schema pushes successfully, no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add signalReports table to Convex schema"
```

---

### Task 2: Create `convex/signalReports.ts` — mutations and queries

**Files:**
- Create: `convex/signalReports.ts`

- [ ] **Step 1: Create the file with all mutations and queries**

Create `convex/signalReports.ts`:

```ts
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const elementValidator = v.object({
  score: v.number(),
  summary: v.string(),
  analysis: v.string(),
  recommendation: v.string(),
});

const elementsValidator = v.object({
  character: elementValidator,
  problem: elementValidator,
  guide: elementValidator,
  plan: elementValidator,
  cta: elementValidator,
  stakes: elementValidator,
  transformation: elementValidator,
});

/** Count successful reports by anonymousId OR email (via leadId). */
export const countUses = query({
  args: {
    anonymousId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Count by anonymousId
    const byAnon = await ctx.db
      .query("signalReports")
      .withIndex("by_anonymousId", (q) =>
        q.eq("anonymousId", args.anonymousId),
      )
      .collect();
    const anonCount = byAnon.filter((r) => r.status === "success").length;

    // Count by email if provided (look up lead first)
    let emailCount = 0;
    if (args.email) {
      const lead = await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", args.email!.toLowerCase()))
        .first();
      if (lead) {
        const byLead = await ctx.db
          .query("signalReports")
          .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
          .collect();
        emailCount = byLead.filter((r) => r.status === "success").length;
      }
    }

    return Math.max(anonCount, emailCount);
  },
});

/** Save a complete signal report. */
export const saveReport = internalMutation({
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("signalReports", {
      ...args,
      accessLevel: "locked",
      createdAt: Date.now(),
    });
  },
});

/** Save a failed or rate-limited report (minimal data). */
export const saveFailedReport = internalMutation({
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
      elements: {
        character: { score: 0, summary: "", analysis: "", recommendation: "" },
        problem: { score: 0, summary: "", analysis: "", recommendation: "" },
        guide: { score: 0, summary: "", analysis: "", recommendation: "" },
        plan: { score: 0, summary: "", analysis: "", recommendation: "" },
        cta: { score: 0, summary: "", analysis: "", recommendation: "" },
        stakes: { score: 0, summary: "", analysis: "", recommendation: "" },
        transformation: { score: 0, summary: "", analysis: "", recommendation: "" },
      },
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: args.status,
      accessLevel: "locked",
      createdAt: Date.now(),
    });
  },
});

/** Get a single report by ID. */
export const getById = query({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reportId);
  },
});

/** Unlock a report (admin use — flip accessLevel). */
export const unlock = mutation({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, { accessLevel: "unlocked" });
  },
});

/** List reports for dashboard. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("signalReports")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});

/** Count reports by status (for success/failure dashboard metrics). */
export const countByStatus = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("signalReports")
      .withIndex("by_createdAt")
      .order("desc")
      .take(500);
    const counts: Record<string, number> = {
      success: 0,
      fetch_failed: 0,
      llm_failed: 0,
      rate_limited: 0,
    };
    for (const r of all) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd dreamfree-site && npx convex dev --once`

Expected: Functions deploy successfully.

- [ ] **Step 3: Commit**

```bash
git add convex/signalReports.ts
git commit -m "feat: add signalReports mutations and queries"
```

---

### Task 3: Update `submitSignalScore` to create leads with email

**Files:**
- Modify: `convex/formSubmissions.ts`

- [ ] **Step 1: Replace the `submitSignalScore` mutation**

In `convex/formSubmissions.ts`, replace the entire `submitSignalScore` mutation (lines 121-144) with:

```ts
/**
 * Signal Score now collects email, so we create/upsert a lead
 * and link the submission to it.
 */
export const submitSignalScore = mutation({
  args: {
    url: v.string(),
    customerDescription: v.string(),
    firstName: v.string(),
    email: v.string(),
    score: v.number(),
    reportId: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const leadId = await ctx.runMutation(internal.leads.upsertLead, {
      email: args.email,
      firstName: args.firstName,
      website: args.url,
      source: "signal_score",
      anonymousId: args.anonymousId,
      signalScore: args.score,
      signalUrl: args.url,
      signalCustomer: args.customerDescription,
    });

    await ctx.db.insert("formSubmissions", {
      leadId,
      type: "signal_score",
      anonymousId: args.anonymousId,
      data: {
        url: args.url,
        customerDescription: args.customerDescription,
        firstName: args.firstName,
        email: args.email,
        score: args.score,
        reportId: args.reportId,
      },
      createdAt: Date.now(),
    });

    if (args.anonymousId) {
      await ctx.runMutation(internal.leads.linkAnonymousEvents, {
        leadId,
        anonymousId: args.anonymousId,
      });
    }

    return { success: true, leadId };
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd dreamfree-site && npx convex dev --once`

Expected: Deploys successfully.

- [ ] **Step 3: Commit**

```bash
git add convex/formSubmissions.ts
git commit -m "feat: submitSignalScore now creates leads with email"
```

---

### Task 4: Add signal score email notifications

**Files:**
- Modify: `convex/emails.ts`

- [ ] **Step 1: Add two new email actions**

In `convex/emails.ts`, add after the existing `sendContactNotification`:

```ts
/** Email the visitor their Signal Score results. */
export const sendSignalScoreToVisitor = internalAction({
  args: {
    firstName: v.string(),
    email: v.string(),
    url: v.string(),
    overallScore: v.number(),
    gruntTestPass: v.boolean(),
    reportId: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping visitor email");
      return;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const reportUrl = `${siteUrl}/report/${args.reportId}`;
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
          <p>Your full element-by-element breakdown is ready. Sign up to see which of the 7 messaging elements are costing you the most enquiries, plus two priority fixes you can action today.</p>
          <p><a href="${reportUrl}" style="display:inline-block;padding:12px 24px;background:#0d7377;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">See Your Breakdown</a></p>
          <p style="color:#7b7b96;font-size:13px;margin-top:24px;">This is your Signal Score — how clearly your website communicates to your ideal customer. It's the first element of The Signal Method, and it's the one that matters most.</p>
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

/** Notify Daniel of a new Signal Score submission. */
export const sendSignalScoreToAdmin = internalAction({
  args: {
    firstName: v.string(),
    email: v.string(),
    url: v.string(),
    customerDescription: v.string(),
    overallScore: v.number(),
    elementScores: v.object({
      character: v.number(),
      problem: v.number(),
      guide: v.number(),
      plan: v.number(),
      cta: v.number(),
      stakes: v.number(),
      transformation: v.number(),
    }),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping admin email");
      return;
    }

    const scores = args.elementScores;
    const scoreRows = [
      `Character: ${scores.character}/10`,
      `Problem: ${scores.problem}/10`,
      `Guide: ${scores.guide}/10`,
      `Plan: ${scores.plan}/10`,
      `CTA: ${scores.cta}/10`,
      `Stakes: ${scores.stakes}/10`,
      `Transformation: ${scores.transformation}/10`,
    ].join("<br />");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dreamfree <notifications@dreamfree.co.uk>",
        to: "daniel@dreamfree.co.uk",
        reply_to: args.email,
        subject: `New Signal Score: ${args.url} — ${args.overallScore}/100`,
        html: `
          <h2>New Signal Score Lead</h2>
          <p><strong>Name:</strong> ${args.firstName}</p>
          <p><strong>Email:</strong> ${args.email}</p>
          <p><strong>Website:</strong> <a href="${args.url}">${args.url}</a></p>
          <p><strong>Ideal Customer:</strong> ${args.customerDescription}</p>
          <hr />
          <p><strong>Overall Score:</strong> ${args.overallScore}/100</p>
          <p><strong>Element Scores:</strong><br />${scoreRows}</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (admin email):", error);
    }
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd dreamfree-site && npx convex dev --once`

Expected: Deploys successfully.

- [ ] **Step 3: Commit**

```bash
git add convex/emails.ts
git commit -m "feat: add signal score email notifications for visitor and admin"
```

---

## Phase 2: LLM Integration

### Task 5: Create `lib/html-stripper.ts`

**Files:**
- Create: `lib/html-stripper.ts`

- [ ] **Step 1: Create the HTML stripping utility**

Create `lib/html-stripper.ts`:

```ts
/**
 * Extract meaningful text content from raw HTML.
 * Strips scripts, styles, nav, footer, and returns clean text
 * with structural hints (headings, links, alt text) preserved.
 * Targets ~3000 tokens of useful content.
 */
export function stripHtml(html: string): string {
  let content = html;

  // Remove entire blocks we don't want
  const blockTags = [
    "script",
    "style",
    "noscript",
    "svg",
    "iframe",
    "video",
    "audio",
  ];
  for (const tag of blockTags) {
    content = content.replace(
      new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      "",
    );
  }

  // Remove nav and footer (often boilerplate)
  content = content.replace(
    /<(nav|footer)[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );

  // Extract alt text from images before removing tags
  const altTexts: string[] = [];
  const altRegex = /alt=["']([^"']+)["']/gi;
  let altMatch;
  while ((altMatch = altRegex.exec(content)) !== null) {
    if (altMatch[1].trim()) {
      altTexts.push(`[Image: ${altMatch[1].trim()}]`);
    }
  }

  // Extract href text from links for CTA analysis
  const ctaTexts: string[] = [];
  const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(content)) !== null) {
    const linkText = linkMatch[1].replace(/<[^>]+>/g, "").trim();
    if (linkText && linkText.length > 1 && linkText.length < 100) {
      ctaTexts.push(`[Link: ${linkText}]`);
    }
  }

  // Preserve heading structure
  content = content.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, text) => {
    const clean = text.replace(/<[^>]+>/g, "").trim();
    return clean ? `\n[H${level}] ${clean}\n` : "";
  });

  // Preserve button text
  content = content.replace(/<button[^>]*>([\s\S]*?)<\/button>/gi, (_m, text) => {
    const clean = text.replace(/<[^>]+>/g, "").trim();
    return clean ? `[Button: ${clean}]` : "";
  });

  // Remove remaining HTML tags
  content = content.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  content = content
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");

  // Collapse whitespace
  content = content.replace(/\s+/g, " ").trim();

  // Append extracted alt texts and CTAs
  if (altTexts.length > 0) {
    content += "\n\n--- Image Alt Texts ---\n" + altTexts.join("\n");
  }
  if (ctaTexts.length > 0) {
    content += "\n\n--- Links & CTAs ---\n" + [...new Set(ctaTexts)].join("\n");
  }

  // Truncate to roughly 3000 tokens (~12000 chars)
  if (content.length > 12000) {
    content = content.slice(0, 12000) + "\n\n[Content truncated]";
  }

  return content;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/html-stripper.ts
git commit -m "feat: add HTML stripping utility for signal score analysis"
```

---

### Task 6: Create `lib/signal-prompt.ts`

**Files:**
- Create: `lib/signal-prompt.ts`

- [ ] **Step 1: Create the LLM prompt**

Create `lib/signal-prompt.ts`:

```ts
/**
 * The Signal Score system prompt.
 *
 * Based on the StoryBrand SB7 framework as practised in Dreamfree audits.
 * This prompt scores the messaging/communication element of The Signal Method.
 * Each sub-element is scored 1-10, total 70, normalised to /100.
 *
 * Reference: docs/superpowers/specs/2026-04-03-signal-score-grader-design.md
 */

export const OPENROUTER_MODEL = "google/gemini-2.0-flash-001";

export function buildSignalPrompt(
  htmlContent: string,
  customerDescription: string,
): { system: string; user: string } {
  const system = `You are a website messaging expert trained in Donald Miller's StoryBrand SB7 framework. You audit business websites for clear, customer-focused communication.

Your job is to analyse a homepage and score it across 7 messaging elements. You must be specific, honest, and reference actual content from the page. Never give generic advice — everything you say must be grounded in what you can see on the page.

## The 7 Elements (each scored 1-10)

### 1. Character (The Hero) — Who is this for?
Can a visitor tell within 5 seconds who this website is for? Is the customer positioned as the hero, or does the site open with the business name, team photo, or "Welcome to..."?
- Score 1-3: No hero identification. Site opens with the business, not the customer. Visitor has no idea if this is for them.
- Score 4-6: Some customer language exists but it's buried below the fold, vague, or secondary to business-centric messaging.
- Score 7-8: Customer is clearly identified above the fold. You can tell who this site serves within 5 seconds.
- Score 9-10: Exceptional hero identification — specific, emotional, immediately resonant. The visitor thinks "this is exactly for me."

### 2. Problem — What's at stake?
Does the site articulate the customer's problem at three levels?
- **External Problem:** The tangible issue (e.g. "My boiler is broken")
- **Internal Problem:** How it makes them feel (e.g. "I'm frustrated and worried")
- **Philosophical Problem:** Why it's just wrong (e.g. "Families shouldn't suffer in their own home")
- Score 1-3: No problem articulation at all. Site jumps straight to services or features.
- Score 4-6: External problem is implied or partially stated. Internal and philosophical problems absent.
- Score 7-8: External and internal problems are clearly articulated. Philosophical may be present.
- Score 9-10: All three levels powerfully articulated. The visitor feels deeply understood.

### 3. Guide — Can I trust this business?
Does the business position itself as a credible guide with both empathy and authority?
- **Empathy:** "We understand your problem" — language that shows they've been in the customer's shoes
- **Authority:** Credentials, years of experience, number of clients, awards, certifications, methodology
- Score 1-3: Neither empathy nor authority demonstrated. Generic "we're professionals" language.
- Score 4-6: Some authority signals (credentials, numbers) but weak empathy, or vice versa.
- Score 7-8: Both empathy and authority clearly present. Testimonials, credentials, and understanding language.
- Score 9-10: Exceptional guide positioning — specific testimonials with outcomes, strong credentials prominently displayed, empathetic language throughout.

### 4. Plan — What do I do next?
Is there a clear, visible step-by-step plan (ideally 3 steps) that shows the customer exactly what happens?
- Score 1-3: No plan visible. Customer has no idea what the process looks like.
- Score 4-6: Some process information exists but it's buried on an inner page or unclear.
- Score 7-8: Clear numbered steps visible on the homepage. Customer understands the path.
- Score 9-10: Simple, specific, confidence-building plan prominently placed. Removes all uncertainty.

### 5. Call to Action — Is there one clear next step?
Is there ONE consistent direct CTA repeated throughout? Is the language the same everywhere? Is there also a transitional CTA for visitors not ready to commit?
- **Direct CTA:** "Book a Call", "Get a Quote" — the primary action
- **Transitional CTA:** "Download our guide", "Take the quiz" — a lower-commitment offer
- Score 1-3: No clear CTA, or multiple competing CTAs with inconsistent language.
- Score 4-6: A CTA exists but language shifts between instances, or there's no transitional CTA.
- Score 7-8: One clear, consistent direct CTA throughout. May lack a transitional CTA.
- Score 9-10: Perfect CTA strategy — consistent direct CTA everywhere plus an effective transitional CTA.

### 6. Stakes (Failure) — What happens if they don't act?
Does the site articulate what the customer stands to lose by not taking action?
- Score 1-3: No stakes mentioned whatsoever. The site is relentlessly positive with zero urgency.
- Score 4-6: Vague implications of negative outcomes but nothing specific or impactful.
- Score 7-8: Clear, tasteful articulation of consequences. Creates urgency without fear-mongering.
- Score 9-10: Specific, honest stakes that motivate action. Statistics, real consequences, emotional cost.

### 7. Transformation (Success) — What does the happy ending look like?
Does the site paint a vivid picture of what life looks like after working with this business?
- Score 1-3: No transformation vision. Generic "we'll help your business grow" language.
- Score 4-6: Some positive outcomes mentioned but vague and interchangeable with any competitor.
- Score 7-8: Specific, vivid outcomes described. The customer can picture their improved future.
- Score 9-10: Compelling before/after framing with measurable outcomes, testimonials with results, emotional transformation.

## The Grunt Test
After analysing the page, answer these 3 questions as if you landed on the homepage for 5 seconds:
1. What do they offer?
2. How will it make my life better?
3. What do I need to do to buy it?

If you can answer all 3 clearly, the site passes. If any are unclear, it fails.

## Rules
- ALWAYS quote specific text, headlines, or CTAs from the page to support your scores.
- ALWAYS identify at least 2-3 things the site does well. Never be purely negative.
- Frame gaps as opportunities ("Adding a 3-step plan to the homepage would...") not criticisms ("The site lacks...").
- Be honest. If the site is genuinely good, say so and score accordingly. Do not manufacture low scores.
- Consider the stated ideal customer when scoring Character and Problem — is the site speaking to THAT person?
- Note any obvious errors: placeholder content, broken elements, inconsistent messaging, stock photos that undermine credibility.

## Response Format
Respond with ONLY valid JSON, no markdown code fences, no commentary outside the JSON:

{
  "gruntTest": {
    "pass": true/false,
    "explanation": "Brief explanation referencing actual page content"
  },
  "elements": {
    "character": {
      "score": <1-10>,
      "summary": "<one line — what's happening with this element>",
      "analysis": "<2-3 paragraphs of detailed analysis quoting actual page content>",
      "recommendation": "<specific, actionable fix in 2-3 sentences>"
    },
    "problem": { "score": <1-10>, "summary": "...", "analysis": "...", "recommendation": "..." },
    "guide": { "score": <1-10>, "summary": "...", "analysis": "...", "recommendation": "..." },
    "plan": { "score": <1-10>, "summary": "...", "analysis": "...", "recommendation": "..." },
    "cta": { "score": <1-10>, "summary": "...", "analysis": "...", "recommendation": "..." },
    "stakes": { "score": <1-10>, "summary": "...", "analysis": "...", "recommendation": "..." },
    "transformation": { "score": <1-10>, "summary": "...", "analysis": "...", "recommendation": "..." }
  },
  "quickWin": "<the single most impactful fix — specific and actionable, 2-3 sentences>",
  "strengths": ["<specific thing they do well>", "<another specific strength>"],
  "fullSummary": "<overall assessment paragraph — honest, balanced, opportunity-focused>"
}`;

  const user = `Analyse this website homepage. The business owner describes their ideal customer as: "${customerDescription}"

--- HOMEPAGE CONTENT ---
${htmlContent}
--- END CONTENT ---

Score all 7 elements, run the Grunt Test, and respond with the JSON structure specified.`;

  return { system, user };
}

/**
 * Normalise the raw 70-point total to a /100 score.
 */
export function calculateOverallScore(elements: Record<string, { score: number }>): number {
  const total = Object.values(elements).reduce((sum, el) => sum + el.score, 0);
  return Math.round((total / 70) * 100);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/signal-prompt.ts
git commit -m "feat: add Signal Score LLM prompt based on SB7 framework"
```

---

### Task 7: Create `app/api/signal-score/route.ts`

**Files:**
- Create: `app/api/signal-score/route.ts`

- [ ] **Step 1: Create the API route**

Create `app/api/signal-score/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "@/convex/_generated/api";
import { stripHtml } from "@/lib/html-stripper";
import {
  buildSignalPrompt,
  calculateOverallScore,
  OPENROUTER_MODEL,
} from "@/lib/signal-prompt";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const MAX_USES = 3;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, customerDescription, firstName, email, anonymousId } = body as {
    url: string;
    customerDescription: string;
    firstName: string;
    email: string;
    anonymousId: string;
  };

  if (!url || !email || !firstName || !customerDescription || !anonymousId) {
    return NextResponse.json(
      { error: "missing_fields" },
      { status: 400 },
    );
  }

  // 1. Rate limit check
  const useCount = await convex.query(api.signalReports.countUses, {
    anonymousId,
    email,
  });

  if (useCount >= MAX_USES) {
    // Still create lead so we capture the contact
    const leadId = await convex.mutation(internal.leads.upsertLead, {
      email,
      firstName,
      website: url,
      source: "signal_score",
      anonymousId,
    });

    await convex.mutation(internal.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "rate_limited",
    });

    return NextResponse.json({
      error: "rate_limited",
      usesRemaining: 0,
    });
  }

  // 2. Create/upsert lead early so we have the ID
  const leadId = await convex.mutation(internal.leads.upsertLead, {
    email,
    firstName,
    website: url,
    source: "signal_score",
    anonymousId,
  });

  // 3. Fetch the website HTML
  let rawHtml: string;
  try {
    const siteUrl = url.startsWith("http") ? url : `https://${url}`;
    const response = await fetch(siteUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DreamfreeBot/1.0; +https://dreamfree.co.uk)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    rawHtml = await response.text();
  } catch (err) {
    await convex.mutation(internal.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "fetch_failed",
    });

    return NextResponse.json({
      error: "fetch_failed",
      message:
        "We couldn't reach that website. Please check the URL and try again.",
      usesRemaining: MAX_USES - useCount,
    });
  }

  // 4. Strip HTML to meaningful content
  const strippedContent = stripHtml(rawHtml);

  if (strippedContent.length < 100) {
    await convex.mutation(internal.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "fetch_failed",
    });

    return NextResponse.json({
      error: "fetch_failed",
      message:
        "We couldn't read enough content from that page. It may use JavaScript rendering that we can't process. Try a different page URL.",
      usesRemaining: MAX_USES - useCount,
    });
  }

  // 5. Call OpenRouter
  const { system, user } = buildSignalPrompt(strippedContent, customerDescription);

  let llmResult: Record<string, unknown>;
  try {
    const openRouterResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://dreamfree.co.uk",
          "X-OpenRouter-Title": "Dreamfree Signal Score",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.3,
        }),
      },
    );

    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter HTTP ${openRouterResponse.status}`);
    }

    const data = await openRouterResponse.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from OpenRouter");
    }

    // Strip markdown code fences if present
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    llmResult = JSON.parse(cleaned);
  } catch (err) {
    await convex.mutation(internal.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "llm_failed",
    });

    return NextResponse.json({
      error: "llm_failed",
      message:
        "Something went wrong during analysis. Your use wasn't counted — please try again.",
      usesRemaining: MAX_USES - useCount,
    });
  }

  // 6. Calculate overall score and save
  const elements = llmResult.elements as Record<
    string,
    { score: number; summary: string; analysis: string; recommendation: string }
  >;
  const overallScore = calculateOverallScore(elements);

  const reportId = await convex.mutation(internal.signalReports.saveReport, {
    leadId,
    anonymousId,
    url,
    customerDescription,
    overallScore,
    gruntTest: llmResult.gruntTest as { pass: boolean; explanation: string },
    elements: elements as {
      character: { score: number; summary: string; analysis: string; recommendation: string };
      problem: { score: number; summary: string; analysis: string; recommendation: string };
      guide: { score: number; summary: string; analysis: string; recommendation: string };
      plan: { score: number; summary: string; analysis: string; recommendation: string };
      cta: { score: number; summary: string; analysis: string; recommendation: string };
      stakes: { score: number; summary: string; analysis: string; recommendation: string };
      transformation: { score: number; summary: string; analysis: string; recommendation: string };
    },
    quickWin: llmResult.quickWin as string,
    strengths: llmResult.strengths as string[],
    fullSummary: llmResult.fullSummary as string,
    status: "success",
  });

  // 7. Trigger emails
  await convex.action(internal.emails.sendSignalScoreToVisitor, {
    firstName,
    email,
    url,
    overallScore,
    gruntTestPass: (llmResult.gruntTest as { pass: boolean }).pass,
    reportId: reportId as string,
  });

  await convex.action(internal.emails.sendSignalScoreToAdmin, {
    firstName,
    email,
    url,
    customerDescription,
    overallScore,
    elementScores: {
      character: elements.character.score,
      problem: elements.problem.score,
      guide: elements.guide.score,
      plan: elements.plan.score,
      cta: elements.cta.score,
      stakes: elements.stakes.score,
      transformation: elements.transformation.score,
    },
  });

  // 8. Also save to formSubmissions for the existing dashboard
  await convex.mutation(api.formSubmissions.submitSignalScore, {
    url,
    customerDescription,
    firstName,
    email,
    score: overallScore,
    reportId: reportId as string,
    anonymousId,
  });

  const newUseCount = useCount + 1;

  return NextResponse.json({
    overallScore,
    gruntTest: llmResult.gruntTest,
    quickWin: llmResult.quickWin,
    reportId,
    usesRemaining: MAX_USES - newUseCount,
  });
}
```

- [ ] **Step 2: Update `.env.local.example`**

Add to `.env.local.example`:

```
# OpenRouter
OPENROUTER_API_KEY=

# Site URL (for email links)
NEXT_PUBLIC_SITE_URL=https://dreamfree.co.uk
```

- [ ] **Step 3: Commit**

```bash
git add app/api/signal-score/route.ts .env.local.example
git commit -m "feat: add signal score API route with OpenRouter integration"
```

---

## Phase 3: Update SignalFlow Modal

### Task 8: Rewrite `SignalFlow.tsx` with email step, real API call, and rate limiting

**Files:**
- Modify: `components/signal-flow/SignalFlow.tsx`

- [ ] **Step 1: Replace the entire SignalFlow component**

Replace the entire contents of `components/signal-flow/SignalFlow.tsx` with:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAnonymousId } from "@/hooks/useAnonymousId";
import { SITE } from "@/lib/constants";

type Step = 1 | 2 | 3 | "analyse" | "result" | "limit" | "error";

const ANALYSIS_STATUSES = [
  "Fetching your website...",
  "Reading your messaging...",
  "Checking hero identification...",
  "Evaluating problem articulation...",
  "Analysing trust signals...",
  "Testing calls to action...",
  "Running the Grunt Test...",
  "Calculating your Signal Score...",
];

export function SignalFlow() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [url, setUrl] = useState("");
  const [customer, setCustomer] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [overallScore, setOverallScore] = useState(0);
  const [gruntTest, setGruntTest] = useState<{
    pass: boolean;
    explanation: string;
  } | null>(null);
  const [quickWin, setQuickWin] = useState("");
  const [usesRemaining, setUsesRemaining] = useState(3);
  const [analyseStatus, setAnalyseStatus] = useState(ANALYSIS_STATUSES[0]);
  const [displayScore, setDisplayScore] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const trackEvent = useMutation(api.events.track);
  const { anonymousId, sessionId } = useAnonymousId();

  const dialogRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(() => {
    setIsOpen(true);
    setStep(1);
    setUrl("");
    setCustomer("");
    setName("");
    setEmail("");
    setOverallScore(0);
    setDisplayScore(0);
    setGruntTest(null);
    setQuickWin("");
    setErrorMessage("");
    document.body.style.overflow = "hidden";
    setTimeout(() => urlInputRef.current?.focus(), 400);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    document.body.style.overflow = "";
  }, []);

  const startAnalysis = useCallback(async () => {
    setStep("analyse");
    setAnalyseStatus(ANALYSIS_STATUSES[0]);

    if (anonymousId) {
      trackEvent({
        type: "signal_score_started",
        anonymousId,
        sessionId,
        path: window.location.pathname,
        properties: { url: url.trim() },
      });
    }

    // Cycle through status messages
    let i = 0;
    const statusInterval = setInterval(() => {
      i++;
      if (i < ANALYSIS_STATUSES.length) {
        setAnalyseStatus(ANALYSIS_STATUSES[i]);
      }
    }, 1500);

    try {
      const response = await fetch("/api/signal-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          customerDescription: customer.trim(),
          firstName: name.trim(),
          email: email.trim(),
          anonymousId,
        }),
      });

      clearInterval(statusInterval);
      const data = await response.json();

      if (data.error === "rate_limited") {
        setUsesRemaining(0);
        setStep("limit");
        return;
      }

      if (data.error) {
        setErrorMessage(
          data.message || "Something went wrong. Please try again.",
        );
        setUsesRemaining(data.usesRemaining ?? usesRemaining);
        setStep("error");
        return;
      }

      setOverallScore(data.overallScore);
      setGruntTest(data.gruntTest);
      setQuickWin(data.quickWin);
      setUsesRemaining(data.usesRemaining);
      setStep("result");

      // Animate score counter
      setTimeout(() => {
        let current = 0;
        const target = data.overallScore;
        const duration = 1500;
        const stepTime = duration / target;
        const counter = setInterval(() => {
          current++;
          setDisplayScore(current);
          if (current >= target) clearInterval(counter);
        }, stepTime);
      }, 400);

      if (anonymousId) {
        trackEvent({
          type: "signal_score_completed",
          anonymousId,
          sessionId,
          path: window.location.pathname,
          properties: { url: url.trim(), score: data.overallScore },
        });
      }
    } catch {
      clearInterval(statusInterval);
      setErrorMessage(
        "Something went wrong connecting to our servers. Please try again.",
      );
      setStep("error");
    }
  }, [
    url,
    customer,
    name,
    email,
    anonymousId,
    sessionId,
    trackEvent,
    usesRemaining,
  ]);

  const goNext = useCallback(
    (current: 1 | 2 | 3) => {
      if (current === 1 && !url.trim()) {
        urlInputRef.current?.focus();
        return;
      }
      if (current === 2 && !customer.trim()) {
        customerInputRef.current?.focus();
        return;
      }
      if (current === 3) {
        if (!name.trim()) {
          nameInputRef.current?.focus();
          return;
        }
        if (!email.trim() || !email.includes("@")) {
          emailInputRef.current?.focus();
          return;
        }
        startAnalysis();
        return;
      }
      setStep((current + 1) as Step);
    },
    [url, customer, name, email, startAnalysis],
  );

  const goBack = useCallback((current: 2 | 3) => {
    setStep((current - 1) as Step);
  }, []);

  // Listen for CTA trigger clicks
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e.target as HTMLElement).closest("[data-modal]");
      if (target) {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // Focus management on step change
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (step === 1) urlInputRef.current?.focus();
      else if (step === 2) customerInputRef.current?.focus();
      else if (step === 3) nameInputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [step, isOpen]);

  const progress =
    step === 1 ? 33 : step === 2 ? 66 : step === 3 ? 100 : 100;

  const displayUrl = url
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  const circumference = 2 * Math.PI * 88;
  const strokeOffset = circumference - (displayScore / 100) * circumference;

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Signal Score flow"
      className="fixed inset-0 z-[200] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-charcoal/95 backdrop-blur-sm animate-fade-in"
        onClick={close}
      />

      {/* Close button */}
      <button
        onClick={close}
        className="absolute top-6 right-6 z-10 text-white/60 transition-colors duration-300 hover:text-white"
        aria-label="Close"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Progress bar */}
      {typeof step === "number" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-teal transition-all duration-500 ease-smooth"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Steps */}
      <div className="relative z-10 mx-auto w-full max-w-lg px-6 animate-modal-in">
        {/* Step 1: URL */}
        {step === 1 && (
          <div className="text-center">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              1 <span className="text-white/30">of 3</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              What&rsquo;s your website address?
            </h2>
            <p className="mb-8 text-sm text-white/50">
              We&rsquo;ll analyse it against the seven elements of clear
              messaging.
            </p>
            <input
              ref={urlInputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goNext(1)}
              placeholder="https://yourbusiness.co.uk"
              autoComplete="url"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
            />
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => goNext(1)}
                className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
              >
                Next
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10h12m0 0l-4-4m4 4l-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="text-xs text-white/25">
                or press{" "}
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/40">
                  Enter ↵
                </kbd>
              </span>
            </div>
          </div>
        )}

        {/* Step 2: Customer */}
        {step === 2 && (
          <div className="text-center">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              2 <span className="text-white/30">of 3</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              Describe your perfect customer in one sentence.
            </h2>
            <p className="mb-8 text-sm text-white/50">
              Who are they, and what problem do you solve for them?
            </p>
            <input
              ref={customerInputRef}
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goNext(2)}
              placeholder="e.g. Homeowners in Hertfordshire who need a reliable plumber fast"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
            />
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                onClick={() => goBack(2)}
                className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors duration-300 hover:text-white"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M16 10H4m0 0l4-4m-4 4l4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
              <button
                onClick={() => goNext(2)}
                className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
              >
                Next
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10h12m0 0l-4-4m4 4l-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Name + Email */}
        {step === 3 && (
          <div className="text-center">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              3 <span className="text-white/30">of 3</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              Where should we send your results?
            </h2>
            <p className="mb-8 text-sm text-white/50">
              We&rsquo;ll email you a copy so you can refer back to it.
            </p>
            <div className="space-y-4">
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") emailInputRef.current?.focus();
                }}
                placeholder="First name"
                autoComplete="given-name"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
              />
              <input
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext(3)}
                placeholder="Email address"
                autoComplete="email"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
              />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                onClick={() => goBack(3)}
                className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors duration-300 hover:text-white"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M16 10H4m0 0l4-4m-4 4l4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
              <button
                onClick={() => goNext(3)}
                className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
              >
                Get My Signal Score
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10h12m0 0l-4-4m4 4l-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Analysing */}
        {step === "analyse" && (
          <div className="text-center">
            <div className="mb-6 inline-block h-10 w-10 animate-spinner rounded-full border-2 border-white/15 border-t-teal" />
            <h2 className="mb-3 text-2xl font-bold text-white">
              Analysing{" "}
              <span className="text-teal-bright">{displayUrl}</span>
            </h2>
            <p className="text-sm text-white/50 transition-opacity duration-200">
              {analyseStatus}
            </p>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                className="text-red-400"
              >
                <path
                  d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white">
              Couldn&rsquo;t complete the analysis
            </h2>
            <p className="mb-8 text-sm text-white/50">{errorMessage}</p>
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {step === "result" && (
          <div className="text-center">
            <p className="mb-6 text-sm font-medium text-white/60">
              {name.trim()
                ? `${name.trim()}, here's your Signal Score.`
                : "Here's your Signal Score."}
            </p>

            {/* Score ring */}
            <div className="relative mx-auto mb-6 h-48 w-48">
              <svg
                viewBox="0 0 200 200"
                className="h-full w-full -rotate-90"
              >
                <circle
                  cx="100"
                  cy="100"
                  r="88"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="6"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="88"
                  fill="none"
                  stroke={
                    overallScore < 35
                      ? "#e8655a"
                      : overallScore < 60
                        ? "#d4943a"
                        : "#0d7377"
                  }
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  className="transition-[stroke-dashoffset] duration-[1.5s] ease-smooth"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-white">
                  {displayScore}
                </span>
                <span className="text-sm text-white/40">/100</span>
              </div>
            </div>

            {/* Grunt Test */}
            {gruntTest && (
              <div className="mb-6">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold ${
                    gruntTest.pass
                      ? "bg-teal/15 text-teal-bright"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {gruntTest.pass ? "Passed" : "Failed"} the Grunt Test
                </span>
              </div>
            )}

            {/* Quick win */}
            <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-teal-bright">
                Your #1 Quick Win
              </h3>
              <p className="text-sm leading-relaxed text-white/70">
                {quickWin}
              </p>
            </div>

            {/* Actions */}
            <a
              href={SITE.phoneTel}
              className="inline-flex items-center gap-2 rounded-[60px] bg-white px-8 py-3 text-sm font-semibold text-charcoal transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.2)]"
            >
              Talk to Daniel About Your Score
            </a>
            <p className="mt-3 text-xs text-white/50">
              We&rsquo;ve emailed your results to{" "}
              <span className="text-white/70">{email.trim()}</span>
            </p>

            {/* Uses remaining */}
            <p className="mt-6 text-xs text-white/30">
              {usesRemaining === 0
                ? "This was your last free Signal Score. For a deeper analysis across all 5 elements, let\u2019s talk."
                : `You have ${usesRemaining} free Signal Score${usesRemaining === 1 ? "" : "s"} remaining`}
            </p>
          </div>
        )}

        {/* Rate limit reached */}
        {step === "limit" && (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal/10">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                className="text-teal"
              >
                <path
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white">
              You&rsquo;ve used your 3 free Signal Scores
            </h2>
            <p className="mb-8 text-sm leading-relaxed text-white/50">
              You&rsquo;ve already got 3 scores&rsquo; worth of insight.
              <br />
              For a full Signal Method audit across all 5 elements, let&rsquo;s
              have a conversation.
            </p>
            <a
              href={SITE.phoneTel}
              className="inline-flex items-center gap-2 rounded-[60px] bg-white px-8 py-3 text-sm font-semibold text-charcoal transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.2)]"
            >
              Call Daniel — {SITE.phone}
            </a>
            <p className="mt-4 text-xs text-white/40">
              Or{" "}
              <a
                href={`mailto:${SITE.email}?subject=Full Signal Method audit`}
                className="text-teal-bright underline"
              >
                email Daniel
              </a>{" "}
              — no obligation, just a conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the dev server compiles**

Run: `cd dreamfree-site && npm run dev`

Expected: No TypeScript errors. Modal should open when clicking any `[data-modal]` CTA.

- [ ] **Step 3: Commit**

```bash
git add components/signal-flow/SignalFlow.tsx
git commit -m "feat: rewrite SignalFlow with email capture, real API call, rate limiting"
```

---

## Phase 4: Report Page

### Task 9: Create report page components

**Files:**
- Create: `components/report/ScoreRing.tsx`
- Create: `components/report/ElementCard.tsx`
- Create: `components/report/GruntTestBadge.tsx`
- Create: `components/report/PaywallOverlay.tsx`

- [ ] **Step 1: Create ScoreRing component**

Create `components/report/ScoreRing.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";

interface ScoreRingProps {
  score: number;
  size?: number;
}

export function ScoreRing({ score, size = 200 }: ScoreRingProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = (size / 2) - 12;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (displayScore / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0;
      const duration = 1500;
      const stepTime = duration / score;
      const counter = setInterval(() => {
        current++;
        setDisplayScore(current);
        if (current >= score) clearInterval(counter);
      }, stepTime);
    }, 300);
    return () => clearTimeout(timer);
  }, [score]);

  const color =
    score < 35 ? "#e8655a" : score < 60 ? "#d4943a" : "#0d7377";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e1dc"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          className="transition-[stroke-dashoffset] duration-[1.5s] ease-smooth"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black text-charcoal">
          {displayScore}
        </span>
        <span className="text-sm text-muted">/100</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ElementCard component**

Create `components/report/ElementCard.tsx`:

```tsx
interface ElementCardProps {
  name: string;
  score: number;
  summary: string;
  analysis?: string;
  recommendation?: string;
  locked: boolean;
}

export function ElementCard({
  name,
  score,
  summary,
  analysis,
  recommendation,
  locked,
}: ElementCardProps) {
  const barWidth = (score / 10) * 100;
  const barColor =
    score <= 3
      ? "bg-red-400"
      : score <= 6
        ? "bg-amber-400"
        : score <= 8
          ? "bg-teal"
          : "bg-emerald-500";

  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-bold text-charcoal">{name}</h3>
        <span className="text-sm font-bold text-charcoal">{score}/10</span>
      </div>

      {/* Score bar */}
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-warm-grey">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <p className="text-[0.9rem] leading-[1.6] text-slate">{summary}</p>

      {recommendation && !locked && (
        <div className="mt-4 rounded-xl bg-teal-glow p-4">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-teal-deep">
            Recommendation
          </h4>
          <p className="text-[0.85rem] leading-[1.6] text-slate">
            {recommendation}
          </p>
        </div>
      )}

      {analysis && !locked && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Detailed Analysis
          </h4>
          <div className="space-y-2 text-[0.85rem] leading-[1.7] text-slate">
            {analysis.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      )}

      {locked && (recommendation || analysis) && (
        <div className="relative mt-4 overflow-hidden rounded-xl">
          <div className="select-none blur-[6px]">
            <div className="rounded-xl bg-teal-glow p-4">
              <p className="text-[0.85rem] text-slate">
                This recommendation contains specific, actionable advice based
                on your website&rsquo;s content and messaging structure.
              </p>
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="text-muted"
            >
              <path
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create GruntTestBadge component**

Create `components/report/GruntTestBadge.tsx`:

```tsx
interface GruntTestBadgeProps {
  pass: boolean;
  explanation: string;
}

export function GruntTestBadge({ pass, explanation }: GruntTestBadgeProps) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        pass
          ? "border-teal/20 bg-teal-glow"
          : "border-red-200 bg-red-50"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            pass
              ? "bg-teal/10 text-teal-deep"
              : "bg-red-100 text-red-600"
          }`}
        >
          {pass ? "PASSED" : "FAILED"}
        </span>
        <span className="text-sm font-bold text-charcoal">
          The Grunt Test
        </span>
      </div>
      <p className="text-[0.85rem] leading-[1.6] text-slate">
        {explanation}
      </p>
      <p className="mt-2 text-[0.8rem] italic text-muted">
        Can a visitor answer these 3 questions within 5 seconds: What do you
        offer? How will it make my life better? What do I need to do to buy it?
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create PaywallOverlay component**

Create `components/report/PaywallOverlay.tsx`:

```tsx
import { SITE } from "@/lib/constants";

export function PaywallOverlay() {
  return (
    <div className="relative my-12 overflow-hidden rounded-2xl border border-border bg-warm-grey p-10 text-center">
      <h3 className="mb-3 text-xl font-bold text-charcoal">
        Unlock Your Full Signal Report
      </h3>
      <p className="mx-auto mb-6 max-w-[50ch] text-[0.95rem] leading-[1.7] text-slate">
        Get the complete analysis for every element — detailed breakdowns, all 7
        recommendations, and a messaging blueprint you can act on today.
      </p>
      <button
        disabled
        className="mb-4 inline-flex cursor-not-allowed items-center gap-2 rounded-[60px] bg-charcoal px-8 py-3 text-sm font-semibold text-white opacity-60"
      >
        Coming Soon — &pound;7
      </button>
      <p className="text-[0.8rem] text-muted">
        Want the full breakdown now?{" "}
        <a
          href={SITE.phoneTel}
          className="font-semibold text-teal transition-colors hover:text-teal-deep"
        >
          Call Daniel
        </a>{" "}
        — he can walk you through it.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/report/
git commit -m "feat: add report page components (ScoreRing, ElementCard, GruntTestBadge, PaywallOverlay)"
```

---

### Task 10: Create the report page with tiered access

**Files:**
- Create: `app/report/[id]/page.tsx`

- [ ] **Step 1: Create the report page**

Create `app/report/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ScoreRing } from "@/components/report/ScoreRing";
import { ElementCard } from "@/components/report/ElementCard";
import { GruntTestBadge } from "@/components/report/GruntTestBadge";
import { PaywallOverlay } from "@/components/report/PaywallOverlay";
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

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();

  // Must be signed in
  if (!user) {
    redirect(`/sign-in?redirect_url=/report/${id}`);
  }

  const userEmail = user.emailAddresses[0]?.emailAddress?.toLowerCase();

  // Fetch the report
  const report = await convex.query(api.signalReports.getById, {
    reportId: id as Id<"signalReports">,
  });

  if (!report || report.status !== "success") {
    notFound();
  }

  // Fetch the lead to check email match
  const lead = await convex.query(api.leads.getById, {
    leadId: report.leadId,
  });

  if (!lead) {
    notFound();
  }

  const isAdmin = userEmail === ADMIN_EMAIL;
  const isOwner = userEmail === lead.email;

  // Not admin and not the person who ran it — 404
  if (!isAdmin && !isOwner) {
    notFound();
  }

  const isUnlocked = report.accessLevel === "unlocked";
  const showFull = isAdmin || isUnlocked;

  // For teaser: find the two lowest-scoring elements
  const elementEntries = Object.entries(report.elements) as [
    string,
    { score: number; summary: string; analysis: string; recommendation: string },
  ][];
  const sorted = [...elementEntries].sort((a, b) => a[1].score - b[1].score);
  const teaserKeys = new Set([sorted[0][0], sorted[1][0]]);

  const reportDate = new Date(report.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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

      {/* Score ring */}
      <div className="mb-10 flex justify-center" data-reveal>
        <ScoreRing score={report.overallScore} size={220} />
      </div>

      {/* Grunt Test */}
      <div className="mb-10" data-reveal>
        <GruntTestBadge
          pass={report.gruntTest.pass}
          explanation={report.gruntTest.explanation}
        />
      </div>

      {/* Strengths */}
      {report.strengths.length > 0 && (
        <div className="mb-10" data-reveal>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            What your site does well
          </h2>
          <ul className="space-y-2">
            {report.strengths.map((strength, i) => (
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

      {/* Element breakdown */}
      <div className="mb-4" data-reveal>
        <h2 className="mb-6 text-lg font-bold text-charcoal">
          Element-by-element breakdown
        </h2>
        <div className="space-y-4">
          {elementEntries.map(([key, el]) => {
            const showRecommendation = showFull || teaserKeys.has(key);
            const showAnalysis = showFull;

            return (
              <ElementCard
                key={key}
                name={ELEMENT_NAMES[key] || key}
                score={el.score}
                summary={el.summary}
                analysis={showAnalysis ? el.analysis : undefined}
                recommendation={
                  showRecommendation ? el.recommendation : "locked"
                }
                locked={!showRecommendation}
              />
            );
          })}
        </div>
      </div>

      {/* Paywall */}
      {!showFull && <PaywallOverlay />}

      {/* Full summary (paid/admin only) */}
      {showFull && report.fullSummary && (
        <div className="mb-10 rounded-2xl border border-border bg-warm-grey p-8" data-reveal>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            Overall Assessment
          </h2>
          <p className="text-[0.95rem] leading-[1.8] text-slate">
            {report.fullSummary}
          </p>
        </div>
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

- [ ] **Step 2: Verify the page renders**

Run: `cd dreamfree-site && npm run dev`

Navigate to `/report/some-invalid-id` — should show 404.

- [ ] **Step 3: Commit**

```bash
git add app/report/
git commit -m "feat: add Signal Score report page with tiered access control"
```

---

## Phase 5: Final Wiring

### Task 11: Add `OPENROUTER_API_KEY` to `.env.local` and test end-to-end

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add the API key**

Add to `.env.local` (do NOT commit this file):

```
OPENROUTER_API_KEY=<your-key-here>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 2: Start the dev server and Convex**

In one terminal: `cd dreamfree-site && npx convex dev`
In another terminal: `cd dreamfree-site && npm run dev`

- [ ] **Step 3: Test the full flow**

1. Click "Grade My Site" in the header
2. Enter a URL (e.g. `https://bitesizesafety.com`)
3. Enter a customer description
4. Enter name and email
5. Wait for analysis (~5-10 seconds)
6. Verify: real score appears, Grunt Test badge, specific quick win referencing actual page content
7. Check Convex dashboard: new `signalReport` and `lead` records exist
8. Check email: both visitor and admin notifications sent

- [ ] **Step 4: Test rate limiting**

Run the grader 3 times. On the 4th attempt, verify the limit screen appears instead of Step 1.

- [ ] **Step 5: Test the report page**

Click the report link from the email. Sign in with Clerk. Verify:
- Teaser tier shows (scores + summaries + top 2 recommendations, rest blurred)
- As admin (daniel@dreamfree.co.uk), all content is visible

- [ ] **Step 6: Commit any adjustments**

```bash
git add -A
git commit -m "feat: signal score grader end-to-end wiring complete"
```

---

## Notes for the Implementing Engineer

1. **The API route calls internal Convex mutations.** `ConvexHttpClient` can only call public functions. If you hit auth errors, you may need to make `saveReport`, `saveFailedReport`, and `upsertLead` public mutations (change `internalMutation` to `mutation`) or create thin public wrappers. The rate-limit check via `countUses` is already a public query.

2. **The OpenRouter model** is set in `lib/signal-prompt.ts` as `OPENROUTER_MODEL`. Change it there to try different models. Gemini Flash is cheap but if quality isn't good enough, try `anthropic/claude-3.5-haiku` or `anthropic/claude-sonnet-4`.

3. **The report page uses server-side rendering** with `currentUser()` from Clerk. This requires the Clerk middleware to be set up. Check `middleware.ts` exists and protects `/report/*`.

4. **Email "from" addresses** must be verified in Resend. `daniel@dreamfree.co.uk` and `notifications@dreamfree.co.uk` need to be set up in the Resend dashboard.
