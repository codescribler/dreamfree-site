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
import { ElementCard } from "@/components/report/ElementCard";
import { GruntTestBadge } from "@/components/report/GruntTestBadge";
import { VerifyPrompt } from "@/components/report/VerifyPrompt";
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

type AccessTier = "public" | "verified";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
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

  const showVerified = tier === "verified";

  // Show account creation prompt if verified but no Clerk account linked
  const showCreateAccount =
    showVerified && !report.clerkUserId && !isAdmin;

  const reportDate = new Date(report.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
                analysis={el.analysis}
                recommendation={el.recommendation}
              />
            ))}
          </div>
        </div>
      )}

      {/* Full summary — VERIFIED */}
      {showVerified && report.fullSummary && (
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
