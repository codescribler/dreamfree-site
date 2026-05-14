"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { timeAgo } from "@/lib/email-campaigns/format";

export function PendingApprovalQueue() {
  const items = useQuery(api.emailCampaigns.listPendingApproval, {});

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-charcoal">
        Pending approval
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {items === undefined ? (
          <p className="px-5 py-6 text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            No sequences awaiting approval. New ones land here as Signal
            Reports complete.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              if (!item.lead) return null;
              return (
                <Link
                  key={item.enrollment._id}
                  href={`/dashboard/email-campaigns/enrollments/${item.enrollment._id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-warm-grey/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-charcoal">
                      {item.lead.firstName ?? item.lead.name ?? "—"}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {item.lead.email}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {item.report?.url ?? "—"}
                      {item.report?.overallScore !== undefined && (
                        <span className="ml-2 font-mono">
                          {item.report.overallScore}/100
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.staleCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {item.staleCount} stale
                      </span>
                    )}
                    {item.totalFlags > 0 && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                        {item.totalFlags} flagged
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {timeAgo(item.enrollment.enrolledAt)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
