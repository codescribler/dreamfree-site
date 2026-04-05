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
import { ShareForm } from "@/components/report/ShareForm";
import { ReportActions } from "@/components/report/ReportActions";

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
  searchParams: Promise<{ token?: string; share_token?: string }>;
}) {
  const { id } = await params;
  const { token, share_token } = await searchParams;

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
  let user;
  try {
    user = await currentUser();
  } catch {
    user = null;
  }
  const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
  const isAdmin = userEmail === ADMIN_EMAIL;

  if (isAdmin) {
    tier = "verified";
  } else if ((token || share_token) && (token === report.verifyToken || share_token === report.verifyToken)) {
    // Magic link token — always grant access and set cookie
    await setVerificationCookie(id);
    try {
      if (report.accessLevel === "public") {
        await convex.mutation(api.signalReports.markVerified, {
          reportId: id as Id<"signalReports">,
        });
      }
    } catch {
      // Non-critical — cookie is set, page will still render as verified
    }
    tier = "verified";
  } else {
    const hasCookie = await hasVerificationCookie(id);
    const isClerkOwner = report.clerkUserId && user?.id === report.clerkUserId;
    tier = hasCookie || isClerkOwner ? "verified" : "public";
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
    <div className="mx-auto max-w-[800px] px-[clamp(1.25rem,4vw,3rem)] py-[clamp(3rem,6vw,5rem)] pb-24">
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
          <ReportCTA reportId={id} phone={lead?.phone ?? ""} />

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
        </>
      )}
    </div>
  );
}
