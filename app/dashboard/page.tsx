"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

const SOURCE_LABELS: Record<string, string> = {
  course_signup: "Course",
  email_capture: "Newsletter",
  contact_form: "Contact",
  signal_score: "Signal Score",
};

const SOURCE_COLOURS: Record<string, string> = {
  course_signup: "bg-purple-100 text-purple-700",
  email_capture: "bg-blue-100 text-blue-700",
  contact_form: "bg-green-100 text-green-700",
  signal_score: "bg-amber-100 text-amber-700",
};

const EVENT_LABELS: Record<string, string> = {
  page_view: "Viewed",
  scroll_depth: "Scrolled",
  form_submission: "Submitted",
  signal_score_started: "Started Signal Score",
  signal_score_completed: "Completed Signal Score",
  cta_click: "Clicked CTA",
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const leads = useQuery(api.leads.list, { limit: 50 });
  const recentEvents = useQuery(api.events.recentActivity, { limit: 20 });

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Leads" value={leads?.length ?? 0} />
        <StatCard
          label="This Week"
          value={
            leads?.filter(
              (l: Doc<"leads">) =>
                l.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000,
            ).length ?? 0
          }
        />
        <StatCard
          label="Contact Enquiries"
          value={
            leads?.filter((l: Doc<"leads">) =>
              l.sources.includes("contact_form"),
            ).length ?? 0
          }
        />
      </div>

      {/* Lead Table */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-charcoal">Leads</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-warm-grey/50">
                  <th className="px-4 py-3 font-semibold text-charcoal">
                    Name / Email
                  </th>
                  <th className="px-4 py-3 font-semibold text-charcoal">
                    Sources
                  </th>
                  <th className="px-4 py-3 font-semibold text-charcoal">
                    Signal Score
                  </th>
                  <th className="px-4 py-3 font-semibold text-charcoal">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads === undefined ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted">
                      Loading...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted">
                      No leads yet. They'll appear here as forms are submitted.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead: Doc<"leads">) => (
                    <tr
                      key={lead._id}
                      className="border-b border-border last:border-b-0 hover:bg-warm-grey/30"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/leads/${lead._id}`}
                          className="font-medium text-charcoal hover:text-teal hover:underline"
                        >
                          {lead.firstName || lead.name || "—"}
                        </Link>
                        <div className="text-xs text-muted">{lead.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {lead.sources.map((src) => (
                            <span
                              key={src}
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLOURS[src] ?? "bg-gray-100 text-gray-600"}`}
                            >
                              {SOURCE_LABELS[src] ?? src}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-charcoal">
                        {lead.signalScore ? (
                          <span className="font-mono font-semibold">
                            {lead.signalScore}/100
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {timeAgo(lead.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-charcoal">
          Recent Activity
        </h2>
        <div className="space-y-2">
          {recentEvents === undefined ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : recentEvents.length === 0 ? (
            <p className="text-sm text-muted">
              No activity yet. Events will appear as visitors browse the site.
            </p>
          ) : (
            recentEvents.map((event: Doc<"events">) => (
              <div
                key={event._id}
                className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm"
              >
                <span className="shrink-0 rounded-md bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                  {EVENT_LABELS[event.type] ?? event.type}
                </span>
                <span className="truncate text-charcoal">{event.path}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-charcoal">{value}</p>
    </div>
  );
}
