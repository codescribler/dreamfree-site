"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const ANALYSIS_STEPS = [
  "Reading your homepage…",
  "Identifying your customer-facing message…",
  "Scoring your Hero, Problem, and Guide elements…",
  "Looking for stakes, transformation, and call-to-action clarity…",
  "Writing your personalised quick win and recommendations…",
  "Almost there — finalising your report…",
];

interface ReportPendingProps {
  reportId: string;
  url: string;
}

export function ReportPending({ reportId, url }: ReportPendingProps) {
  const router = useRouter();
  const data = useQuery(api.signalReports.getByIdWithLead, {
    reportId: reportId as Id<"signalReports">,
  });
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, ANALYSIS_STEPS.length - 1));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // When the action completes (success or failure), refresh the page so the
  // server component re-renders with the appropriate branch.
  useEffect(() => {
    if (!data?.report) return;
    if (data.report.status !== "pending") {
      router.refresh();
    }
  }, [data?.report?.status, router, data?.report]);

  const cleanUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="mx-auto max-w-[640px] px-[clamp(1.25rem,4vw,3rem)] pt-28 pb-24">
      <div className="text-center">
        <span className="mb-3 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
          Signal Score Report
        </span>
        <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold tracking-tight text-charcoal">
          {cleanUrl}
        </h1>
      </div>

      <div className="mt-12 rounded-2xl border border-border bg-white p-8">
        <div className="flex items-center justify-center gap-3">
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-pulse rounded-full bg-teal"
          />
          <p className="text-base font-semibold text-charcoal">
            Analysing your site
          </p>
        </div>

        <p className="mt-3 text-center text-sm text-muted">
          {ANALYSIS_STEPS[stepIndex]}
        </p>

        <div className="mt-8 rounded-lg border border-border bg-warm-grey/40 p-4 text-sm leading-relaxed text-slate">
          <p>
            <strong className="text-charcoal">This usually takes 20–60 seconds.</strong>{" "}
            Feel free to leave this page open — it will update automatically.
          </p>
          <p className="mt-2">
            We&rsquo;ll also email you the link once it&rsquo;s ready, so you can
            close this tab and come back later if you prefer.
          </p>
        </div>
      </div>
    </div>
  );
}
