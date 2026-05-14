"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { timeAgo } from "@/lib/email-campaigns/format";

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-blue-100 text-blue-700",
  delivered: "bg-blue-100 text-blue-700",
  opened: "bg-green-100 text-green-700",
  clicked: "bg-purple-100 text-purple-700",
  bounced: "bg-red-100 text-red-700",
  complained: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

export function RecentSends() {
  const items = useQuery(api.emailCampaigns.listRecentSends, {});

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-charcoal">
        Recently sent
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {items === undefined ? (
          <p className="px-5 py-6 text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            No emails have been sent yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div
                key={item.send._id}
                className="flex items-center gap-3 px-5 py-3 text-sm"
              >
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.send.status] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {item.send.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-charcoal">
                  {item.send.subject}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {item.lead?.email ?? "—"}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {timeAgo(item.send.sentAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
