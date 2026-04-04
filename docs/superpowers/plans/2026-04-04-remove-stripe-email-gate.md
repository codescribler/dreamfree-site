# Remove Stripe — Email-Only Access Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-tier access model (public/verified/paid) with a two-tier model (public/verified) where email verification unlocks the full report.

**Architecture:** Remove all Stripe payment code (checkout route, webhook, BuyPrompt component, markPaid mutation). Collapse the "paid" tier into "verified" so verified users see all content. Adjust the CreateAccountPrompt to show after verification instead of after payment.

**Tech Stack:** Next.js 16, Convex, Clerk, TypeScript

---

### Task 1: Remove Stripe from schema and mutations

**Files:**
- Modify: `convex/schema.ts:119-129`
- Modify: `convex/signalReports.ts:151-190`

- [ ] **Step 1: Update the accessLevel union in schema.ts**

In `convex/schema.ts`, change lines 119-129 from:

```typescript
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
```

To:

```typescript
    accessLevel: v.union(v.literal("public"), v.literal("verified")),
    verifyCode: v.string(),
    verifyToken: v.string(),
```

This removes `"paid"` from the union and drops `firstViewedAt`, `stripeSessionId`, `paidAt`, and `paidAmount`.

- [ ] **Step 2: Remove setFirstViewed and markPaid mutations**

In `convex/signalReports.ts`, delete the `setFirstViewed` mutation (lines 150-159) and the `markPaid` mutation (lines 172-190). Keep `markVerified` (lines 161-170) and `linkClerkUser` (lines 192-201) intact.

The file should go from `getById` (ends ~line 148) straight to `markVerified`, then `linkClerkUser`, then `getByIdWithLead`.

- [ ] **Step 3: Verify Convex schema pushes cleanly**

Run: `npx convex dev --once`

Expected: No schema validation errors. (There are no existing "paid" reports, so no data conflicts.)

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/signalReports.ts
git commit -m "chore: remove Stripe payment fields and mutations from Convex"
```

---

### Task 2: Delete Stripe API routes and BuyPrompt component

**Files:**
- Delete: `app/api/report/[id]/checkout/route.ts`
- Delete: `app/api/webhooks/stripe/route.ts`
- Delete: `components/report/BuyPrompt.tsx`

- [ ] **Step 1: Delete the three files**

```bash
rm app/api/report/[id]/checkout/route.ts
rm app/api/webhooks/stripe/route.ts
rm components/report/BuyPrompt.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -u
git commit -m "chore: delete Stripe checkout route, webhook, and BuyPrompt component"
```

---

### Task 3: Update the report page to two-tier access

**Files:**
- Modify: `app/report/[id]/page.tsx`

- [ ] **Step 1: Remove the BuyPrompt import (line 15)**

Delete this line:

```typescript
import { BuyPrompt } from "@/components/report/BuyPrompt";
```

- [ ] **Step 2: Remove the AccessTier type and replace with simplified logic**

Replace the `AccessTier` type (line 47):

```typescript
type AccessTier = "public" | "verified" | "paid";
```

With:

```typescript
type AccessTier = "public" | "verified";
```

- [ ] **Step 3: Remove `paid` from searchParams destructuring**

Change line 54:

```typescript
  searchParams: Promise<{ token?: string; paid?: string }>;
```

To:

```typescript
  searchParams: Promise<{ token?: string }>;
```

- [ ] **Step 4: Remove the firstViewedAt fire-and-forget block**

Delete lines 75-82 entirely (the "Record first view" block):

```typescript
  // Record first view (fire and forget)
  if (!report.firstViewedAt) {
    convex
      .mutation(api.signalReports.setFirstViewed, {
        reportId: id as Id<"signalReports">,
      })
      .catch(() => {});
  }
```

- [ ] **Step 5: Simplify the access tier logic**

Replace the entire tier determination block (lines 84-122) with:

```typescript
  // Determine access tier
  let tier: AccessTier = "public";

  // Check admin
  const user = await currentUser();
  const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
  const isAdmin = userEmail === ADMIN_EMAIL;

  if (isAdmin) {
    tier = "verified"; // Admin sees everything
  } else if (report.accessLevel === "verified") {
    const hasCookie = await hasVerificationCookie(id);
    const isClerkOwner = report.clerkUserId && user?.id === report.clerkUserId;
    tier = hasCookie || isClerkOwner ? "verified" : "public";
  } else {
    // Check magic link token
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
```

- [ ] **Step 6: Replace the derived booleans and showCreateAccount logic**

Replace:

```typescript
  const showVerified = tier === "verified" || tier === "paid";
  const showPaid = tier === "paid";

  // Show account creation prompt if paid but no Clerk account linked
  const showCreateAccount =
    report.accessLevel === "paid" && !report.clerkUserId && !isAdmin;
```

With:

```typescript
  const showVerified = tier === "verified";

  // Show account creation prompt if verified but no Clerk account linked
  const showCreateAccount =
    showVerified && !report.clerkUserId && !isAdmin;
```

- [ ] **Step 7: Remove the firstViewedAt variable**

Delete this line:

```typescript
  const firstViewedAt = report.firstViewedAt ?? Date.now();
```

- [ ] **Step 8: Update ElementCard rendering to pass full content when verified**

Replace the element cards block (lines 231-243):

```tsx
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
```

With:

```tsx
            {elementEntries.map(([key, el]) => (
              <ElementCard
                key={key}
                name={ELEMENT_NAMES[key] || key}
                score={el.score}
                summary={el.summary}
                analysis={el.analysis}
                recommendation={el.recommendation}
              />
            ))}
```

- [ ] **Step 9: Remove the BuyPrompt JSX block**

Delete lines 246-249:

```tsx
      {/* Buy prompt — shown when VERIFIED but NOT paid */}
      {showVerified && !showPaid && (
        <BuyPrompt reportId={id} firstViewedAt={firstViewedAt} />
      )}
```

- [ ] **Step 10: Change fullSummary from paid-only to verified**

Replace:

```tsx
      {/* Full summary — PAID only */}
      {showPaid && report.fullSummary && (
```

With:

```tsx
      {/* Full summary — VERIFIED */}
      {showVerified && report.fullSummary && (
```

- [ ] **Step 11: Commit**

```bash
git add app/report/[id]/page.tsx
git commit -m "feat: collapse paid tier into verified — email unlocks full report"
```

---

### Task 4: Simplify ElementCard (remove locked prop)

**Files:**
- Modify: `components/report/ElementCard.tsx`

- [ ] **Step 1: Remove the locked prop from the interface**

Replace the entire `ElementCard` component with:

```tsx
interface ElementCardProps {
  name: string;
  score: number;
  summary: string;
  analysis?: string;
  recommendation?: string;
}

export function ElementCard({
  name,
  score,
  summary,
  analysis,
  recommendation,
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

      {recommendation && (
        <div className="mt-4 rounded-xl bg-teal-glow p-4">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-teal-deep">
            Recommendation
          </h4>
          <p className="text-[0.85rem] leading-[1.6] text-slate">
            {recommendation}
          </p>
        </div>
      )}

      {analysis && (
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
    </div>
  );
}
```

This removes the `locked` prop and the entire blurred/lock-icon overlay block.

- [ ] **Step 2: Commit**

```bash
git add components/report/ElementCard.tsx
git commit -m "refactor: remove locked state from ElementCard"
```

---

### Task 5: Update create-account route guard

**Files:**
- Modify: `app/api/report/[id]/create-account/route.ts:34`

- [ ] **Step 1: Change the access guard from "paid" to "verified"**

In `app/api/report/[id]/create-account/route.ts`, replace line 34:

```typescript
  if (!data?.report || !data?.lead || data.report.accessLevel !== "paid") {
```

With:

```typescript
  if (!data?.report || !data?.lead || data.report.accessLevel !== "verified") {
```

- [ ] **Step 2: Commit**

```bash
git add app/api/report/[id]/create-account/route.ts
git commit -m "fix: allow account creation after email verification instead of payment"
```

---

### Task 6: Remove Stripe dependency and env vars

**Files:**
- Modify: `package.json:24`
- Modify: `.env.local.example:23-27`

- [ ] **Step 1: Remove stripe from package.json**

Remove this line from the `dependencies` section of `package.json`:

```json
    "stripe": "^22.0.0"
```

(Don't forget to also remove the trailing comma from the previous line if needed to keep valid JSON.)

- [ ] **Step 2: Remove Stripe env vars from .env.local.example**

Remove lines 23-27 (the Stripe section):

```
# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_EARLY=
STRIPE_PRICE_STANDARD=
```

- [ ] **Step 3: Run npm install to update lockfile**

```bash
npm install
```

Expected: `stripe` removed from `node_modules` and `package-lock.json` updated.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore: remove stripe dependency and env vars"
```

---

### Task 7: Verify the build

- [ ] **Step 1: Run the build**

```bash
npm run build
```

Expected: Clean build with no errors. No references to deleted files, removed mutations, or Stripe imports.

- [ ] **Step 2: Check for any remaining Stripe references**

```bash
grep -r "stripe\|Stripe\|STRIPE" --include="*.ts" --include="*.tsx" --include="*.js" app/ components/ convex/ lib/
```

Expected: No matches (or only this plan file if it's in scope).

- [ ] **Step 3: Commit if any cleanup was needed**

Only commit if Step 2 found straggling references that needed fixing.
