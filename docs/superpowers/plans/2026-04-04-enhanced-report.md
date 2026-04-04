# Enhanced Signal Score Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Signal Score report into a narrative-driven sales tool with score context, element preview teaser, Problem → Solution → Confidence flow, callback request CTA, and upgraded LLM model.

**Architecture:** Update the LLM prompt to return `businessImpact` + `recommendations[]` per element. Add phone field to the lead capture form. Restructure the report page into narrative sections with new components. Add a callback request system with admin notification.

**Tech Stack:** Next.js 16, Convex, Clerk, TypeScript, OpenRouter (Qwen3.6 Plus with Gemini Flash fallback)

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `components/report/ScoreContext.tsx` | Score-range-dependent context message below score ring |
| `components/report/ElementPreview.tsx` | Public tier: all 7 scores with blurred overlay + unlock CTA |
| `components/report/BusinessImpactCard.tsx` | "Costing you customers" section card (score + impact + analysis) |
| `components/report/ActionPlanCard.tsx` | "How to fix it" section card (numbered recommendations) |
| `components/report/StrengthCard.tsx` | "What you're doing well" section card (score + summary) |
| `components/report/CallbackModal.tsx` | Phone confirmation popup for report review CTA |
| `convex/callbackRequests.ts` | Callback request mutations |

### Modified Files
| File | Changes |
|------|---------|
| `convex/schema.ts` | Add `phone` to leads, add `callbackRequests` table, change element `recommendation` → `recommendations` array, add `businessImpact` |
| `convex/signalReports.ts` | Update validators for new element shape |
| `convex/leads.ts` | Accept + store phone field |
| `convex/emails.ts` | Add callback notification email action |
| `lib/signal-prompt.ts` | New model, new response schema (recommendations[], businessImpact) |
| `app/api/signal-score/route.ts` | Accept phone, model fallback logic, new LlmResult interface |
| `components/signal-flow/SignalFlow.tsx` | Add phone input to step 3 |
| `app/report/[id]/page.tsx` | Full restructure to narrative flow |
| `components/report/VerifyPrompt.tsx` | Updated CTA text |

### Deleted Files
| File | Reason |
|------|--------|
| `components/report/ElementCard.tsx` | Replaced by BusinessImpactCard, ActionPlanCard, StrengthCard |

---

### Task 1: Update Convex schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add phone to leads table**

In `convex/schema.ts`, add `phone` field to the leads table. Change:

```typescript
  leads: defineTable({
    email: v.string(),
    firstName: v.optional(v.string()),
    name: v.optional(v.string()),
    website: v.optional(v.string()),
```

To:

```typescript
  leads: defineTable({
    email: v.string(),
    firstName: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
```

- [ ] **Step 2: Update signalReports element shape**

Replace each element object validator (there are 7 of them: character, problem, guide, plan, cta, stakes, transformation) from:

```typescript
      character: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        recommendation: v.string(),
      }),
```

To (repeat for all 7):

```typescript
      character: v.object({
        score: v.number(),
        summary: v.string(),
        analysis: v.string(),
        businessImpact: v.string(),
        recommendations: v.array(v.string()),
      }),
```

- [ ] **Step 3: Add callbackRequests table**

Add this table after the `signalReports` table definition (before the `// ── FUTURE TABLES` comment):

```typescript
  callbackRequests: defineTable({
    leadId: v.id("leads"),
    reportId: v.id("signalReports"),
    phone: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("contacted"),
      v.literal("closed"),
    ),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),
```

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: update schema for enhanced report — recommendations array, businessImpact, phone, callbackRequests"
```

---

### Task 2: Update Convex mutations and validators

**Files:**
- Modify: `convex/signalReports.ts`
- Modify: `convex/leads.ts`
- Create: `convex/callbackRequests.ts`

- [ ] **Step 1: Update element validator in signalReports.ts**

In `convex/signalReports.ts`, replace the `elementValidator` and `EMPTY_ELEMENT` definitions (lines 4-18):

```typescript
const elementValidator = v.object({
  score: v.number(),
  summary: v.string(),
  analysis: v.string(),
  recommendation: v.string(),
});
```

With:

```typescript
const elementValidator = v.object({
  score: v.number(),
  summary: v.string(),
  analysis: v.string(),
  businessImpact: v.string(),
  recommendations: v.array(v.string()),
});
```

And replace the `EMPTY_ELEMENT` (lines 57-62):

```typescript
const EMPTY_ELEMENT = {
  score: 0,
  summary: "",
  analysis: "",
  recommendation: "",
};
```

With:

```typescript
const EMPTY_ELEMENT = {
  score: 0,
  summary: "",
  analysis: "",
  businessImpact: "",
  recommendations: [],
};
```

- [ ] **Step 2: Add phone to leads upsert**

In `convex/leads.ts`, add `phone` to the `upsertLead` internal mutation args (line 27-38):

```typescript
export const upsertLead = internalMutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    source: v.string(),
    anonymousId: v.optional(v.string()),
    signalScore: v.optional(v.number()),
    signalUrl: v.optional(v.string()),
    signalCustomer: v.optional(v.string()),
  },
```

In the existing lead update block (around line 44-60), add after the website check:

```typescript
      if (args.phone && !existing.phone) {
        updates.phone = args.phone;
      }
```

In the new lead insert block (around line 72-84), add `phone`:

```typescript
    return await ctx.db.insert("leads", {
      email,
      firstName: args.firstName,
      name: args.name,
      phone: args.phone,
      website: args.website,
      anonymousIds: args.anonymousId ? [args.anonymousId] : [],
      sources: [args.source],
      signalScore: args.signalScore,
      signalUrl: args.signalUrl,
      signalCustomer: args.signalCustomer,
      lastSeenAt: now,
      createdAt: now,
    });
```

Also add `phone` to the `upsertLeadPublic` mutation args (line 138-149):

```typescript
export const upsertLeadPublic = mutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    source: v.string(),
    anonymousId: v.optional(v.string()),
    signalScore: v.optional(v.number()),
    signalUrl: v.optional(v.string()),
    signalCustomer: v.optional(v.string()),
  },
```

- [ ] **Step 3: Create callbackRequests.ts**

Create `convex/callbackRequests.ts`:

```typescript
import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const create = mutation({
  args: {
    leadId: v.id("leads"),
    reportId: v.id("signalReports"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("callbackRequests", {
      leadId: args.leadId,
      reportId: args.reportId,
      phone: args.phone,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add convex/signalReports.ts convex/leads.ts convex/callbackRequests.ts
git commit -m "feat: update Convex mutations for enhanced report data model"
```

---

### Task 3: Update LLM prompt and model

**Files:**
- Modify: `lib/signal-prompt.ts`

- [ ] **Step 1: Update model and add fallback constant**

Replace the model export (line 11):

```typescript
export const OPENROUTER_MODEL = "google/gemini-2.0-flash-001";
```

With:

```typescript
export const OPENROUTER_MODEL_PRIMARY = "qwen/qwen3.6-plus:free";
export const OPENROUTER_MODEL_FALLBACK = "google/gemini-2.0-flash-001";
```

- [ ] **Step 2: Update the response format in the system prompt**

Replace the response format section (lines 96-120) with:

```typescript
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
      "businessImpact": "<one sentence explaining how this score affects the business's ability to win customers>",
      "recommendations": ["<specific actionable fix 1>", "<fix 2 only if it adds distinct value>"]
    },
    "problem": { "score": <1-10>, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["..."] },
    "guide": { "score": <1-10>, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["..."] },
    "plan": { "score": <1-10>, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["..."] },
    "cta": { "score": <1-10>, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["..."] },
    "stakes": { "score": <1-10>, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["..."] },
    "transformation": { "score": <1-10>, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["..."] }
  },
  "quickWin": "<the single most impactful fix — specific and actionable, 2-3 sentences>",
  "strengths": ["<specific thing they do well>", "<another specific strength>"],
  "fullSummary": "<overall assessment paragraph — honest, balanced, opportunity-focused>"
}`;
```

- [ ] **Step 3: Add recommendation rules to the system prompt**

Add these rules to the `## Rules` section (after line 93, before the Response Format section):

```typescript
- For each element, provide 1-3 recommendations as an array. Always provide at least 1. Only add a 2nd or 3rd if they would provide distinctly different, actionable value — not padding. Maximum 3 per element.
- The businessImpact field must be a single sentence explaining WHY this element's score matters to the business owner's bottom line. Frame it in terms of lost leads, missed revenue, or visitor behaviour. Example: "If visitors can't tell who your site is for within 5 seconds, they leave — and every departure is a potential customer lost."
```

- [ ] **Step 4: Commit**

```bash
git add lib/signal-prompt.ts
git commit -m "feat: update LLM prompt — Qwen3.6 Plus model, recommendations array, businessImpact"
```

---

### Task 4: Update the signal-score API route

**Files:**
- Modify: `app/api/signal-score/route.ts`

- [ ] **Step 1: Update imports**

Replace the import (lines 6-8):

```typescript
import {
  buildSignalPrompt,
  calculateOverallScore,
  OPENROUTER_MODEL,
} from "@/lib/signal-prompt";
```

With:

```typescript
import {
  buildSignalPrompt,
  calculateOverallScore,
  OPENROUTER_MODEL_PRIMARY,
  OPENROUTER_MODEL_FALLBACK,
} from "@/lib/signal-prompt";
```

- [ ] **Step 2: Update the SignalElement interface**

Replace the `SignalElement` interface (lines 16-21):

```typescript
interface SignalElement {
  score: number;
  summary: string;
  analysis: string;
  recommendation: string;
}
```

With:

```typescript
interface SignalElement {
  score: number;
  summary: string;
  analysis: string;
  businessImpact: string;
  recommendations: string[];
}
```

- [ ] **Step 3: Accept phone in the request body**

Update the body destructuring (lines 40-47):

```typescript
  const body = await req.json();
  const { url, customerDescription, firstName, email, anonymousId, phone } = body as {
    url: string;
    customerDescription: string;
    firstName: string;
    email: string;
    anonymousId: string;
    phone?: string;
  };
```

- [ ] **Step 4: Pass phone to lead upsert**

Update both lead upsert calls. The one at line 61-67:

```typescript
    const leadId = await convex.mutation(api.leads.upsertLeadPublic, {
      email,
      firstName,
      phone,
      website: url,
      source: "signal_score",
      anonymousId,
    });
```

And the one at line 81-87:

```typescript
  const leadId = await convex.mutation(api.leads.upsertLeadPublic, {
    email,
    firstName,
    phone,
    website: url,
    source: "signal_score",
    anonymousId,
  });
```

- [ ] **Step 5: Add model fallback logic**

Replace the entire OpenRouter call block (lines 149-204) with a helper function and fallback:

```typescript
  // 5. Call OpenRouter (with model fallback)
  const { system, user } = buildSignalPrompt(
    strippedContent,
    customerDescription,
  );

  async function callOpenRouter(model: string): Promise<LlmResult> {
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
          model,
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

    const cleaned = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned);
  }

  let llmResult: LlmResult;
  try {
    llmResult = await callOpenRouter(OPENROUTER_MODEL_PRIMARY);
  } catch {
    try {
      console.warn("Primary model failed, falling back to Gemini Flash");
      llmResult = await callOpenRouter(OPENROUTER_MODEL_FALLBACK);
    } catch {
      await convex.mutation(api.signalReports.saveFailedReport, {
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
  }
```

- [ ] **Step 6: Commit**

```bash
git add app/api/signal-score/route.ts
git commit -m "feat: add phone capture, model fallback, updated LlmResult interface"
```

---

### Task 5: Add phone field to SignalFlow form

**Files:**
- Modify: `components/signal-flow/SignalFlow.tsx`

- [ ] **Step 1: Add phone state and ref**

After the existing state declarations (line 57), add:

```typescript
  const [phone, setPhone] = useState("");
```

After the `emailInputRef` (line 70), add:

```typescript
  const phoneInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Update draft persistence**

Update the `loadDraft` function signature (line 14) to include phone:

```typescript
function loadDraft(): { url: string; customer: string; name: string; email: string; phone: string; step: Step } {
  const empty = { url: "", customer: "", name: "", email: "", phone: "", step: 1 as Step };
```

Update the `saveDraft` function signature (line 28):

```typescript
function saveDraft(data: { url: string; customer: string; name: string; email: string; phone: string; step: Step }) {
```

In the `open` callback, add `setPhone(draft.phone);` after `setEmail(draft.email);`.

In the `useEffect` for persistence (line 215-219), add `phone`:

```typescript
  useEffect(() => {
    if (typeof step === "number") {
      saveDraft({ url, customer, name, email, phone, step });
    }
  }, [url, customer, name, email, phone, step]);
```

- [ ] **Step 3: Add phone to the API call**

In the `startAnalysis` function, update the fetch body (line 121-127):

```typescript
        body: JSON.stringify({
          url: url.trim(),
          customerDescription: customer.trim(),
          firstName: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          anonymousId,
        }),
```

- [ ] **Step 4: Add phone input to step 3 UI**

In step 3's form, add a phone input after the email input and before the closing `</div>` of the `space-y-4` container. The email input's `onKeyDown` should focus the phone input instead of calling `goNext(3)`. The phone input's `onKeyDown` calls `goNext(3)`:

```tsx
              <input
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") phoneInputRef.current?.focus();
                }}
                placeholder="Email address"
                autoComplete="email"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
              />
              <input
                ref={phoneInputRef}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext(3)}
                placeholder="Phone number (optional)"
                autoComplete="tel"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
              />
```

- [ ] **Step 5: Add phone to goNext dependency array**

Update the `startAnalysis` dependency array to include `phone`:

```typescript
  ], [
    url,
    customer,
    name,
    email,
    phone,
    anonymousId,
    sessionId,
    trackEvent,
    usesRemaining,
  ]);
```

- [ ] **Step 6: Commit**

```bash
git add components/signal-flow/SignalFlow.tsx
git commit -m "feat: add phone field to Signal Score form (step 3)"
```

---

### Task 6: Create new report components

**Files:**
- Create: `components/report/ScoreContext.tsx`
- Create: `components/report/ElementPreview.tsx`
- Create: `components/report/BusinessImpactCard.tsx`
- Create: `components/report/ActionPlanCard.tsx`
- Create: `components/report/StrengthCard.tsx`
- Create: `components/report/CallbackModal.tsx`

- [ ] **Step 1: Create ScoreContext.tsx**

```tsx
interface ScoreContextProps {
  score: number;
}

export function ScoreContext({ score }: ScoreContextProps) {
  let message: string;

  if (score < 50) {
    message = `A score of ${score} means your website is likely losing the majority of potential customers before they ever get in touch.`;
  } else if (score < 70) {
    message = `A score of ${score} means your website is converting some visitors, but there's significant room to capture more leads.`;
  } else {
    message = `A score of ${score} means your website communicates well — but there are still opportunities to sharpen your message and win more business.`;
  }

  return (
    <div className="mt-4 text-center">
      <p className="text-[0.85rem] leading-[1.6] text-slate">{message}</p>
      <p className="mt-2 text-[0.8rem] text-muted">
        Your Signal Score predicts how effectively your website turns visitors
        into customers. The higher your score, the more leads your site
        generates.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create ElementPreview.tsx**

```tsx
"use client";

interface ElementPreviewProps {
  elements: [string, { score: number; summary: string }][];
  names: Record<string, string>;
  url: string;
}

export function ElementPreview({ elements, names, url }: ElementPreviewProps) {
  const displayUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="my-10" data-reveal>
      <h2 className="mb-6 text-lg font-bold text-charcoal">
        Your 7-element breakdown
      </h2>
      <div className="space-y-3">
        {elements.map(([key, el]) => {
          const barWidth = (el.score / 10) * 100;
          const barColor =
            el.score <= 3
              ? "bg-red-400"
              : el.score <= 6
                ? "bg-amber-400"
                : el.score <= 8
                  ? "bg-teal"
                  : "bg-emerald-500";

          return (
            <div
              key={key}
              className="rounded-xl border border-border bg-white px-5 py-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[0.9rem] font-semibold text-charcoal">
                  {names[key] || key}
                </span>
                <span className="text-sm font-bold text-charcoal">
                  {el.score}/10
                </span>
              </div>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-warm-grey">
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-700`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <p className="text-[0.8rem] leading-[1.5] text-muted">
                {el.summary}
              </p>
            </div>
          );
        })}
      </div>

      {/* Blurred overlay teaser */}
      <div className="relative mt-4 overflow-hidden rounded-2xl">
        <div className="select-none blur-[6px]">
          <div className="space-y-3 p-4">
            <div className="rounded-xl bg-warm-grey p-5">
              <p className="text-sm text-slate">
                Detailed analysis of each element with specific recommendations
                tailored to your website content and messaging structure.
              </p>
            </div>
            <div className="rounded-xl bg-teal-glow p-5">
              <p className="text-sm text-slate">
                Your personalised action plan with step-by-step fixes to improve
                your messaging and convert more visitors into customers.
              </p>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="mb-3 text-teal"
          >
            <path
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-center text-sm font-semibold text-charcoal">
            Unlock your 7 personalised recommendations
          </p>
          <p className="mt-1 text-center text-xs text-muted">
            tailored specifically to{" "}
            <span className="font-semibold text-teal">{displayUrl}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create BusinessImpactCard.tsx**

```tsx
interface BusinessImpactCardProps {
  name: string;
  score: number;
  businessImpact: string;
  analysis: string;
}

export function BusinessImpactCard({
  name,
  score,
  businessImpact,
  analysis,
}: BusinessImpactCardProps) {
  const barWidth = (score / 10) * 100;
  const barColor =
    score <= 3
      ? "bg-red-400"
      : score <= 6
        ? "bg-amber-400"
        : "bg-teal";

  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-bold text-charcoal">{name}</h3>
        <span className="text-sm font-bold text-charcoal">{score}/10</span>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-warm-grey">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <p className="mb-4 text-[0.85rem] font-medium leading-[1.6] text-red-600/80">
        {businessImpact}
      </p>

      <div className="space-y-2 text-[0.85rem] leading-[1.7] text-slate">
        {analysis.split("\n\n").map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ActionPlanCard.tsx**

```tsx
interface ActionPlanCardProps {
  name: string;
  recommendations: string[];
}

export function ActionPlanCard({
  name,
  recommendations,
}: ActionPlanCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-teal-glow p-6">
      <h3 className="mb-3 text-[0.95rem] font-bold text-charcoal">{name}</h3>
      <ol className="space-y-3">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
              {i + 1}
            </span>
            <p className="text-[0.85rem] leading-[1.6] text-slate">{rec}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 5: Create StrengthCard.tsx**

```tsx
interface StrengthCardProps {
  name: string;
  score: number;
  summary: string;
}

export function StrengthCard({ name, score, summary }: StrengthCardProps) {
  const barWidth = (score / 10) * 100;
  const barColor = score <= 8 ? "bg-teal" : "bg-emerald-500";

  return (
    <div className="rounded-2xl border border-teal/15 bg-teal-glow/50 p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[0.9rem] font-semibold text-charcoal">{name}</h3>
        <span className="text-sm font-bold text-teal-deep">{score}/10</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/50">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <p className="text-[0.85rem] leading-[1.6] text-slate">{summary}</p>
    </div>
  );
}
```

- [ ] **Step 6: Create CallbackModal.tsx**

```tsx
"use client";

import { useState } from "react";

interface CallbackModalProps {
  reportId: string;
  phone: string;
  onClose: () => void;
}

export function CallbackModal({
  reportId,
  phone: initialPhone,
  onClose,
}: CallbackModalProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/report/${reportId}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        setDone(true);
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-border bg-white p-8 text-center shadow-xl">
        {done ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal/10">
              <svg
                width="24"
                height="24"
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
            <h3 className="mb-2 text-lg font-bold text-charcoal">
              Request received
            </h3>
            <p className="mb-6 text-[0.9rem] text-slate">
              Daniel will be in touch shortly to arrange a time for your free
              report review call.
            </p>
            <button
              onClick={onClose}
              className="rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h3 className="mb-2 text-lg font-bold text-charcoal">
              Request a free report review call
            </h3>
            <p className="mb-6 text-[0.9rem] text-slate">
              Is this the best number to contact you on?
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Your phone number"
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-center text-lg text-charcoal placeholder:text-muted focus:border-teal focus:outline-none"
                disabled={loading}
              />
              {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading || !phone.trim()}
                className="mt-4 w-full rounded-[60px] bg-teal px-6 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {loading ? "Sending request..." : "Request Call"}
              </button>
            </form>
            <button
              onClick={onClose}
              className="mt-3 text-xs text-muted transition-colors hover:text-charcoal"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add components/report/ScoreContext.tsx components/report/ElementPreview.tsx components/report/BusinessImpactCard.tsx components/report/ActionPlanCard.tsx components/report/StrengthCard.tsx components/report/CallbackModal.tsx
git commit -m "feat: add new report components — ScoreContext, ElementPreview, BusinessImpactCard, ActionPlanCard, StrengthCard, CallbackModal"
```

---

### Task 7: Create callback API route and email notification

**Files:**
- Create: `app/api/report/[id]/callback/route.ts`
- Modify: `convex/emails.ts`

- [ ] **Step 1: Create the callback API route**

Create `app/api/report/[id]/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
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
  const { phone } = body as { phone: string };

  if (!phone || phone.trim().length < 5) {
    return NextResponse.json(
      { error: "Please enter a valid phone number." },
      { status: 400 },
    );
  }

  let data;
  try {
    data = await convex.query(api.signalReports.getByIdWithLead, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!data?.report || !data?.lead) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await convex.mutation(api.callbackRequests.create, {
    leadId: data.report.leadId,
    reportId: id as Id<"signalReports">,
    phone: phone.trim(),
  });

  // Notify Daniel
  convex
    .action(api.emails.sendCallbackNotification, {
      firstName: data.lead.firstName || "Unknown",
      email: data.lead.email,
      phone: phone.trim(),
      url: data.report.url,
      overallScore: data.report.overallScore,
      reportId: id,
    })
    .catch((err) => console.error("Callback notification failed:", err));

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Add callback notification email to emails.ts**

Add this action to the end of `convex/emails.ts`:

```typescript
/** Notify Daniel when a lead requests a report review callback. */
export const sendCallbackNotification = action({
  args: {
    firstName: v.string(),
    email: v.string(),
    phone: v.string(),
    url: v.string(),
    overallScore: v.number(),
    reportId: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping callback notification");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const reportLink = `${siteUrl}/report/${args.reportId}`;

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
        subject: `Callback requested: ${args.firstName} (Score: ${args.overallScore}/100)`,
        html: `
          <h2>Report Review Call Requested</h2>
          <p><strong>Name:</strong> ${args.firstName}</p>
          <p><strong>Email:</strong> ${args.email}</p>
          <p><strong>Phone:</strong> ${args.phone}</p>
          <p><strong>Website:</strong> <a href="${args.url}">${args.url}</a></p>
          <p><strong>Signal Score:</strong> ${args.overallScore}/100</p>
          <hr />
          <p><a href="${reportLink}">View their report</a></p>
          <p style="color:#7b7b96;font-size:13px;margin-top:16px;">This lead has reviewed their Signal Score report and wants to talk. Call them.</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (callback notification):", error);
    }
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add app/api/report/[id]/callback/route.ts convex/emails.ts
git commit -m "feat: add callback request API route and admin email notification"
```

---

### Task 8: Restructure the report page

**Files:**
- Modify: `app/report/[id]/page.tsx`
- Delete: `components/report/ElementCard.tsx`

- [ ] **Step 1: Delete ElementCard.tsx**

```bash
rm components/report/ElementCard.tsx
```

- [ ] **Step 2: Rewrite the report page**

Replace the entire contents of `app/report/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { buildMetadata } from "@/lib/metadata";
import {
  hasVerificationCookie,
  setVerificationCookie,
} from "@/lib/report-cookie";
import { ScoreRing } from "@/components/report/ScoreRing";
import { ScoreContext } from "@/components/report/ScoreContext";
import { GruntTestBadge } from "@/components/report/GruntTestBadge";
import { ElementPreview } from "@/components/report/ElementPreview";
import { VerifyPrompt } from "@/components/report/VerifyPrompt";
import { BusinessImpactCard } from "@/components/report/BusinessImpactCard";
import { ActionPlanCard } from "@/components/report/ActionPlanCard";
import { StrengthCard } from "@/components/report/StrengthCard";
import { CreateAccountPrompt } from "@/components/report/CreateAccountPrompt";
import { ReportCTA } from "@/components/report/ReportCTA";
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

const WEAK_THRESHOLD = 6;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return buildMetadata({
    title: "Signal Score Report",
    description:
      "Your personalised website messaging audit powered by The Signal Method.",
    path: `/report/${id}`,
  });
}

type AccessTier = "public" | "verified";

interface ReportElement {
  score: number;
  summary: string;
  analysis: string;
  businessImpact: string;
  recommendations: string[];
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

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

  // Determine access tier
  let tier: AccessTier = "public";
  const user = await currentUser();
  const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
  const isAdmin = userEmail === ADMIN_EMAIL;

  if (isAdmin) {
    tier = "verified";
  } else if (report.accessLevel === "verified") {
    const hasCookie = await hasVerificationCookie(id);
    const isClerkOwner = report.clerkUserId && user?.id === report.clerkUserId;
    tier = hasCookie || isClerkOwner ? "verified" : "public";
  } else {
    if (token && token === report.verifyToken) {
      await setVerificationCookie(id);
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

  const showVerified = tier === "verified";
  const showCreateAccount = showVerified && !report.clerkUserId && !isAdmin;

  const reportDate = new Date(report.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const elementEntries = Object.entries(report.elements) as [
    string,
    ReportElement,
  ][];

  // Split elements into weak (<=6) and strong (7+)
  const weakElements = elementEntries
    .filter(([, el]) => el.score <= WEAK_THRESHOLD)
    .sort(([, a], [, b]) => a.score - b.score);

  const strongElements = elementEntries
    .filter(([, el]) => el.score > WEAK_THRESHOLD)
    .sort(([, a], [, b]) => b.score - a.score);

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

      {/* Score ring + context — PUBLIC */}
      <div className="mb-10" data-reveal>
        <div className="flex justify-center">
          <ScoreRing score={report.overallScore} size={220} />
        </div>
        <ScoreContext score={report.overallScore} />
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

      {/* Element preview — PUBLIC (scores visible, details locked) */}
      {!showVerified && (
        <ElementPreview
          elements={elementEntries.map(([key, el]) => [
            key,
            { score: el.score, summary: el.summary },
          ])}
          names={ELEMENT_NAMES}
          url={report.url}
        />
      )}

      {/* Verify prompt — shown when NOT verified */}
      {!showVerified && <VerifyPrompt reportId={id} />}

      {/* ── VERIFIED CONTENT: NARRATIVE FLOW ── */}
      {showVerified && (
        <>
          {/* Context intro */}
          <div className="mb-10" data-reveal>
            <p className="text-[0.95rem] leading-[1.8] text-slate">
              Below is your full Signal Score breakdown. Each element measures a
              specific part of how your website communicates to potential
              customers — and directly affects whether visitors become paying
              clients. We&rsquo;ve analysed your site against The Signal Method
              framework and identified exactly where you&rsquo;re losing leads
              and how to fix it.
            </p>
          </div>

          {/* 1. What's costing you customers */}
          {weakElements.length > 0 && (
            <div className="mb-10" data-reveal>
              <h2 className="mb-2 text-lg font-bold text-charcoal">
                What&rsquo;s costing you customers
              </h2>
              <p className="mb-6 text-[0.85rem] text-muted">
                These elements scored 6 or below — each one represents visitors
                who leave without getting in touch.
              </p>
              <div className="space-y-4">
                {weakElements.map(([key, el]) => (
                  <BusinessImpactCard
                    key={key}
                    name={ELEMENT_NAMES[key] || key}
                    score={el.score}
                    businessImpact={el.businessImpact}
                    analysis={el.analysis}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 2. Your personalised action plan */}
          {weakElements.length > 0 && (
            <div className="mb-10" data-reveal>
              <h2 className="mb-2 text-lg font-bold text-charcoal">
                Your personalised action plan
              </h2>
              <p className="mb-6 text-[0.85rem] text-muted">
                Specific fixes for each weak element — implement these and your
                score will climb.
              </p>
              <div className="space-y-4">
                {weakElements.map(([key, el]) => (
                  <ActionPlanCard
                    key={key}
                    name={ELEMENT_NAMES[key] || key}
                    recommendations={el.recommendations}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 3. What you're doing well */}
          {strongElements.length > 0 && (
            <div className="mb-10" data-reveal>
              <h2 className="mb-2 text-lg font-bold text-charcoal">
                What you&rsquo;re doing well
              </h2>
              <p className="mb-6 text-[0.85rem] text-muted">
                Keep doing these — they&rsquo;re already working in your favour.
              </p>
              <div className="space-y-3">
                {strongElements.map(([key, el]) => (
                  <StrengthCard
                    key={key}
                    name={ELEMENT_NAMES[key] || key}
                    score={el.score}
                    summary={el.summary}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Overall assessment */}
          {report.fullSummary && (
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

          {/* Account creation prompt */}
          {showCreateAccount && (
            <CreateAccountPrompt reportId={id} email={lead?.email ?? ""} />
          )}

          {/* Primary + secondary CTA */}
          <ReportCTA
            reportId={id}
            phone={lead?.phone ?? ""}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create ReportCTA component**

Create `components/report/ReportCTA.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CallbackModal } from "./CallbackModal";
import { SITE } from "@/lib/constants";

interface ReportCTAProps {
  reportId: string;
  phone: string;
}

export function ReportCTA({ reportId, phone }: ReportCTAProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="mt-12 text-center" data-reveal>
        <h2 className="mb-3 text-xl font-bold text-charcoal">
          Want someone to fix this for you?
        </h2>
        <p className="mb-6 text-[0.95rem] text-slate">
          Daniel can walk you through your report and show you what your site
          could look like with these changes applied. Book a free 15-minute
          report review call — no obligation, no pressure.
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
        >
          Request a Free Report Review Call
        </button>
        <p className="mt-6 text-xs text-muted">
          Or call Daniel directly —{" "}
          <a
            href={SITE.phoneTel}
            className="font-semibold text-teal transition-colors hover:text-teal-deep"
          >
            {SITE.phone}
          </a>
        </p>
        <p className="mt-1 text-xs text-muted">
          <a
            href={`mailto:${SITE.email}?subject=My Signal Score report`}
            className="font-semibold text-teal transition-colors hover:text-teal-deep"
          >
            Email Daniel
          </a>
        </p>
      </div>

      {showModal && (
        <CallbackModal
          reportId={reportId}
          phone={phone}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Update VerifyPrompt CTA text**

In `components/report/VerifyPrompt.tsx`, replace the heading and description (lines 60-66):

```tsx
      <h3 className="mb-2 text-lg font-bold text-charcoal">
        Unlock Your Score Breakdown
      </h3>
      <p className="mb-6 text-[0.9rem] text-slate">
        We&rsquo;ve sent a code to your email. Enter it below to see how each
        of the 7 messaging elements scored.
      </p>
```

With:

```tsx
      <h3 className="mb-2 text-lg font-bold text-charcoal">
        See what&rsquo;s costing you customers
      </h3>
      <p className="mb-6 text-[0.9rem] text-slate">
        Enter your code to unlock your full breakdown — including detailed
        analysis and personalised recommendations for every element.
      </p>
```

- [ ] **Step 5: Commit**

```bash
git add -u
git add components/report/ReportCTA.tsx
git commit -m "feat: restructure report page into narrative flow with new components and CTA"
```

---

### Task 9: Clean up existing data and verify build

- [ ] **Step 1: Delete existing report documents in Convex**

Go to the Convex dashboard → Data → signalReports. Delete all existing documents — they use the old schema shape (`recommendation: string` instead of `recommendations: string[]`).

Also delete any documents in the `leads` table that were created during testing if desired (optional).

- [ ] **Step 2: Deploy Convex schema**

```bash
npx convex dev --once
```

Expected: Schema pushes cleanly with the new element shape, phone field, and callbackRequests table.

- [ ] **Step 3: Build Next.js**

```bash
rm -rf .next && npm run build
```

Expected: Clean build with no TypeScript errors.

- [ ] **Step 4: Check for any remaining old references**

Search for `recommendation:` (singular, non-array usage) in the codebase:

```bash
grep -rn "recommendation:" --include="*.ts" --include="*.tsx" app/ components/ convex/ lib/ | grep -v "recommendations:"
```

Expected: No matches in app code (only in plan/spec docs).

- [ ] **Step 5: Commit if any cleanup was needed**

Only commit if Step 4 found straggling references that needed fixing.
