"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import type { Doc } from "@/convex/_generated/dataModel";

const EVENT_LABELS: Record<string, string> = {
  page_view: "Page View",
  scroll_depth: "Scrolled",
  form_submission: "Form Submitted",
  signal_score_started: "Started Signal Score",
  signal_score_completed: "Completed Signal Score",
  cta_click: "Clicked CTA",
};

const EVENT_COLOURS: Record<string, string> = {
  page_view: "bg-blue-100 text-blue-700",
  scroll_depth: "bg-gray-100 text-gray-600",
  form_submission: "bg-green-100 text-green-700",
  signal_score_started: "bg-amber-100 text-amber-700",
  signal_score_completed: "bg-amber-100 text-amber-700",
  cta_click: "bg-purple-100 text-purple-700",
};

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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const leadId = id as Id<"leads">;

  const lead = useQuery(api.leads.getById, { leadId });
  const events = useQuery(api.events.listByLead, { leadId, limit: 100 });
  const submissions = useQuery(api.formSubmissions.listByLead, { leadId });
  const reports = useQuery(api.signalReports.listByLead, { leadId });

  if (lead === undefined) {
    return <p className="py-12 text-center text-muted">Loading...</p>;
  }

  if (lead === null) {
    return <p className="py-12 text-center text-muted">Lead not found.</p>;
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-charcoal"
      >
        &larr; Back to dashboard
      </Link>

      {/* Lead header */}
      <div className="rounded-xl border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-charcoal">
              {lead.firstName || lead.name || "Unknown"}
            </h1>
            <p className="mt-1 text-sm text-muted">{lead.email}</p>
            {lead.phone && (
              <p className="mt-0.5 text-sm text-muted">{lead.phone}</p>
            )}
            {lead.website && (
              <p className="mt-0.5 text-sm text-muted">{lead.website}</p>
            )}
          </div>
          <div className="text-right text-sm text-muted">
            <p>First seen: {formatDate(lead.createdAt)}</p>
            <p>Last seen: {formatDate(lead.lastSeenAt)}</p>
          </div>
        </div>

        {/* Sources */}
        <div className="mt-4 flex flex-wrap gap-2">
          {lead.sources.map((src) => (
            <span
              key={src}
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${SOURCE_COLOURS[src] ?? "bg-gray-100 text-gray-600"}`}
            >
              {SOURCE_LABELS[src] ?? src}
            </span>
          ))}
        </div>

        {/* Signal Score */}
        {lead.signalScore !== undefined && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm font-medium text-charcoal">
              Signal Score:
            </span>
            <span className="text-2xl font-bold text-teal">
              {lead.signalScore}/100
            </span>
          </div>
        )}
      </div>

      {/* Signal Reports */}
      {reports && reports.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            Signal Reports
          </h2>
          <div className="space-y-3">
            {reports.map((report: Doc<"signalReports">) => (
              <Link
                key={report._id}
                href={`/report/${report._id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-white px-5 py-4 transition hover:bg-warm-grey/30"
              >
                <div>
                  <p className="text-sm font-medium text-charcoal">
                    {report.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(report.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {report.status === "success" && (
                    <span className="text-lg font-bold text-teal">
                      {report.overallScore}/100
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      report.status === "success"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {report.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Form Submissions */}
      {submissions && submissions.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            Form Submissions
          </h2>
          <div className="space-y-3">
            {submissions.map((sub: Doc<"formSubmissions">) => (
              <div
                key={sub._id}
                className="rounded-xl border border-border bg-white px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLOURS[sub.type] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {SOURCE_LABELS[sub.type] ?? sub.type}
                  </span>
                  <span className="text-xs text-muted">
                    {formatDate(sub.createdAt)}
                  </span>
                </div>
                {sub.data && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-warm-grey p-3 text-xs text-slate">
                    {JSON.stringify(sub.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Event Timeline */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-charcoal">
          Activity Timeline
        </h2>
        {events === undefined ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event: Doc<"events">) => (
              <div
                key={event._id}
                className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm"
              >
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${EVENT_COLOURS[event.type] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {EVENT_LABELS[event.type] ?? event.type}
                </span>
                <span className="truncate text-charcoal">{event.path}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
