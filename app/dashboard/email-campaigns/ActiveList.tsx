"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { timeAgo } from "@/lib/email-campaigns/format";

export function ActiveList() {
  const items = useQuery(api.emailCampaigns.listActive, {});

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-charcoal">
        Active enrollments
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {items === undefined ? (
          <p className="px-5 py-6 text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            No sequences currently sending. Approved sequences will appear here.
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
                    <p className="mt-0.5 text-xs text-muted">
                      Sent {item.sentCount}/{item.totalDrafts} ·{" "}
                      {item.nextScheduled
                        ? `Next: ${item.nextScheduled.role} ${timeAgo(
                            item.nextScheduled.scheduledFor,
                          )}`
                        : "No upcoming send scheduled"}
                    </p>
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
