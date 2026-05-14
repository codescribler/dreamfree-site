"use client";

import Link from "next/link";
import type { Doc } from "@/convex/_generated/dataModel";

const STATUS_BADGE: Record<string, string> = {
  generating: "bg-blue-100 text-blue-700",
  generation_failed: "bg-red-100 text-red-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  paused: "bg-orange-100 text-orange-700",
  stopped: "bg-gray-200 text-gray-700",
  completed: "bg-teal/20 text-teal-deep",
  unsubscribed: "bg-red-100 text-red-700",
};

export function EnrollmentHeader({
  enrollment,
  lead,
  report,
}: {
  enrollment: Doc<"emailEnrollments">;
  lead: Doc<"leads"> | null;
  report: Doc<"signalReports"> | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-bold text-charcoal">
            {lead?.firstName ?? lead?.name ?? "—"}
          </h1>
          <p className="mt-1 text-sm text-muted">{lead?.email ?? "—"}</p>
          {report && (
            <p className="mt-2 text-sm text-muted">
              <span className="font-mono">{report.url}</span>
              <span className="ml-2 font-semibold text-charcoal">
                {report.overallScore}/100
              </span>
            </p>
          )}
          <div className="mt-3 flex gap-3 text-xs">
            {lead && (
              <Link
                href={`/dashboard/leads/${lead._id}`}
                className="text-teal hover:underline"
              >
                View lead →
              </Link>
            )}
            {report && (
              <Link
                href={`/report/${report._id}`}
                className="text-teal hover:underline"
              >
                View report →
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              STATUS_BADGE[enrollment.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {enrollment.status}
            {enrollment.pausedReason && ` (${enrollment.pausedReason})`}
          </span>
          {enrollment.generationError && (
            <p className="max-w-xs text-right text-xs text-red-700">
              {enrollment.generationError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
