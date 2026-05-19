"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Filter = "all" | "engaged" | "pending";

function timeAgo(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "engaged", label: "Engaged" },
  { value: "pending", label: "Not yet viewed" },
];

export default function ApiLeadsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useQuery(api.leads.listOutbound, { filter });
  const markEngaged = useMutation(api.leads.markEngaged);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleMarkEngaged(leadId: Id<"leads">) {
    if (pendingId) return;
    setPendingId(leadId);
    try {
      await markEngaged({ leadId });
    } catch (err) {
      console.error("markEngaged failed", err);
      alert("Failed to mark as engaged. Check console for details.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal">API leads</h1>
        <p className="mt-1 text-sm text-muted">
          Leads created via the Signal Report API. They appear on the main
          dashboard once they click through to view their report. Use{" "}
          <strong>Mark as engaged</strong> to retroactively tag a prospect you
          know clicked before engagement tracking shipped.
        </p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-teal text-white"
                : "bg-white text-muted ring-1 ring-border hover:text-charcoal"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-warm-grey/50">
                <th className="px-4 py-3 font-semibold text-charcoal">Email</th>
                <th className="px-4 py-3 font-semibold text-charcoal">API key</th>
                <th className="px-4 py-3 font-semibold text-charcoal">URL audited</th>
                <th className="px-4 py-3 font-semibold text-charcoal">Score</th>
                <th className="px-4 py-3 font-semibold text-charcoal">Status</th>
                <th className="px-4 py-3 font-semibold text-charcoal">First viewed</th>
                <th className="px-4 py-3 font-semibold text-charcoal">Created</th>
                <th className="px-4 py-3 font-semibold text-charcoal text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows === undefined ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    No API leads in this filter.
                  </td>
                </tr>
              ) : (
                rows.map(({ lead, report, apiKeyName }) => {
                  const views = report?.viewCount ?? 0;
                  const engaged = lead.firstEngagedAt != null;
                  const busy = pendingId === lead._id;
                  return (
                    <tr
                      key={lead._id}
                      className="border-b border-border last:border-b-0 hover:bg-warm-grey/30"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/leads/${lead._id}`}
                          className="font-medium text-charcoal hover:text-teal hover:underline"
                        >
                          {lead.email}
                        </Link>
                        {lead.firstName ? (
                          <div className="text-xs text-muted">{lead.firstName}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted">{apiKeyName ?? "—"}</td>
                      <td className="px-4 py-3">
                        {report ? (
                          <span className="truncate text-charcoal">
                            {report.url}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-charcoal">
                        {report?.status === "success" ? (
                          <span className="font-mono font-semibold">
                            {report.overallScore}/100
                          </span>
                        ) : (
                          <span className="text-muted">
                            {report?.status ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {views > 0 ? (
                          <span className="inline-block rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold text-teal">
                            Viewed ×{views}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Not viewed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {timeAgo(report?.firstViewedAt)}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {timeAgo(lead.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {engaged ? (
                          <span className="text-xs text-muted">—</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleMarkEngaged(lead._id as Id<"leads">)
                            }
                            className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-charcoal transition-colors hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? "Marking…" : "Mark as engaged"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
