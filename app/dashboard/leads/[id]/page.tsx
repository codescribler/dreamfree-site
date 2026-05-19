"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import type { Doc } from "@/convex/_generated/dataModel";
import { EmailCampaignSection } from "./EmailCampaignSection";

const EVENT_LABELS: Record<string, string> = {
  page_view: "Page View",
  scroll_depth: "Scrolled",
  form_submission: "Form Submitted",
  signal_score_started: "Started Signal Score",
  signal_score_completed: "Completed Signal Score",
  cta_click: "Clicked CTA",
  outbound_report_viewed: "Opened their report",
};

const EVENT_COLOURS: Record<string, string> = {
  page_view: "bg-blue-100 text-blue-700",
  scroll_depth: "bg-gray-100 text-gray-600",
  form_submission: "bg-green-100 text-green-700",
  signal_score_started: "bg-amber-100 text-amber-700",
  signal_score_completed: "bg-amber-100 text-amber-700",
  cta_click: "bg-purple-100 text-purple-700",
  outbound_report_viewed: "bg-teal/20 text-teal",
};

const SOURCE_LABELS: Record<string, string> = {
  course_signup: "Course",
  email_capture: "Newsletter",
  contact_form: "Contact",
  signal_score: "Signal Score",
  api_outbound: "Outbound (API)",
  demo_request: "Demo Request",
};

const SOURCE_COLOURS: Record<string, string> = {
  course_signup: "bg-purple-100 text-purple-700",
  email_capture: "bg-blue-100 text-blue-700",
  contact_form: "bg-green-100 text-green-700",
  signal_score: "bg-amber-100 text-amber-700",
  api_outbound: "bg-slate-100 text-slate-700",
  demo_request: "bg-indigo-100 text-indigo-700",
};

function prettyHost(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function eventTarget(event: Doc<"events">): string | null {
  const props = (event.properties ?? {}) as Record<string, unknown>;
  const url = typeof props.url === "string" ? props.url : null;
  if (url) return prettyHost(url);
  // Don't show opaque /report/<id> paths — the recentActivity query enriches
  // these server-side with the audited URL; in the lead-detail page we use
  // listByLead which doesn't, so suppress to avoid showing the id.
  if (event.path.startsWith("/report/")) return null;
  return event.path;
}

function eventDetail(event: Doc<"events">): string | null {
  const props = (event.properties ?? {}) as Record<string, unknown>;
  if (event.type === "scroll_depth") {
    const depth = typeof props.depth === "number" ? props.depth : null;
    if (depth != null) return `${depth}%`;
  }
  if (event.type === "outbound_report_viewed") {
    const viewCount = typeof props.viewCount === "number" ? props.viewCount : 1;
    return `view #${viewCount}`;
  }
  return null;
}

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
  const demoRequests = useQuery(api.demoRequests.listForLead, { leadId });
  const callbackRequests = useQuery(api.callbackRequests.listForLead, {
    leadId,
  });

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

        {/* Engagement summary — quick at-a-glance signals for lead scoring */}
        {(events && events.length > 0) ||
        (demoRequests && demoRequests.length > 0) ||
        (callbackRequests && callbackRequests.length > 0) ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {lead.engagementCount && lead.engagementCount > 0 ? (
              <span className="inline-block rounded-full bg-teal/15 px-3 py-1 text-xs font-semibold text-teal">
                Report views ×{lead.engagementCount}
              </span>
            ) : null}
            {(() => {
              if (!events) return null;
              let maxScroll = 0;
              for (const e of events) {
                if (e.type !== "scroll_depth") continue;
                const depth = (e.properties as { depth?: unknown })?.depth;
                if (typeof depth === "number" && depth > maxScroll) {
                  maxScroll = depth;
                }
              }
              return maxScroll >= 25 ? (
                <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  Read {maxScroll}%
                </span>
              ) : null;
            })()}
            {demoRequests && demoRequests.length > 0 ? (
              <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                Demo request ×{demoRequests.length}
              </span>
            ) : null}
            {callbackRequests && callbackRequests.length > 0 ? (
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Callback ×{callbackRequests.length}
              </span>
            ) : null}
            {submissions && submissions.length > 0 ? (
              <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                Forms ×{submissions.length}
              </span>
            ) : null}
            {events && events.length > 0 ? (
              <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {events.length} event{events.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <EmailCampaignSection leadId={lead._id} email={lead.email} />

      {/* Signal Reports */}
      {reports && reports.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            Signal Reports
          </h2>
          <div className="space-y-3">
            {reports.map((report: Doc<"signalReports">) => (
              <ReportRow key={report._id} report={report} />
            ))}
          </div>
        </section>
      )}

      {/* Demo Requests */}
      {demoRequests && demoRequests.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            Demo Requests
          </h2>
          <div className="space-y-3">
            {demoRequests.map((req: Doc<"demoRequests">) => (
              <div
                key={req._id}
                className="rounded-xl border border-border bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-charcoal">
                      {req.businessName || req.firstName || req.email}
                      {req.industry ? (
                        <span className="ml-2 text-sm font-normal text-muted">
                          · {req.industry}
                        </span>
                      ) : null}
                    </p>
                    {req.website ? (
                      <p className="mt-1 truncate font-mono text-xs text-charcoal">
                        {prettyHost(req.website)}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    {req.status}
                  </span>
                </div>
                {req.mainGoal ? (
                  <p className="mt-2 text-xs text-muted">
                    <span className="font-medium text-charcoal">Goal:</span>{" "}
                    {req.mainGoal}
                  </p>
                ) : null}
                {req.idealCustomer ? (
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium text-charcoal">Ideal customer:</span>{" "}
                    {req.idealCustomer}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>Requested {formatDate(req.createdAt)}</span>
                  {req.demoUrl ? (
                    <a
                      href={req.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      ↗ {prettyHost(req.demoUrl)}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Callback Requests */}
      {callbackRequests && callbackRequests.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            Callback Requests
          </h2>
          <div className="space-y-3">
            {callbackRequests.map((req: Doc<"callbackRequests">) => (
              <div
                key={req._id}
                className="rounded-xl border border-border bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-charcoal">
                      📞 {req.phone}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Requested {formatDate(req.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {req.status}
                  </span>
                </div>
              </div>
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
            {events.map((event: Doc<"events">) => {
              const target = eventTarget(event);
              const detail = eventDetail(event);
              return (
                <div
                  key={event._id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm"
                >
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${EVENT_COLOURS[event.type] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {EVENT_LABELS[event.type] ?? event.type}
                  </span>
                  {detail ? (
                    <span className="shrink-0 text-xs font-semibold text-charcoal">
                      {detail}
                    </span>
                  ) : null}
                  {target ? (
                    <span
                      className="min-w-0 truncate font-mono text-xs text-charcoal"
                      title={target}
                    >
                      {target}
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-xs text-muted">
                    {timeAgo(event.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  pending: "bg-blue-100 text-blue-700",
  rate_limited: "bg-amber-100 text-amber-700",
  fetch_failed: "bg-red-100 text-red-700",
  llm_failed: "bg-red-100 text-red-700",
};

function ReportRow({ report }: { report: Doc<"signalReports"> }) {
  const [isReRunning, setIsReRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRerun(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        "Reset this user's rate limit and re-run a fresh report for them? They'll receive an email when it's ready.",
      )
    ) {
      return;
    }
    setIsReRunning(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/reports/${report._id}/rerun`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }
      // Hard navigation to bypass the Next.js router cache — the new
      // pending report row was inserted moments ago and a soft push can
      // occasionally render against stale "not found" cache.
      window.location.href = `/report/${data.newReportId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-run failed");
      setIsReRunning(false);
    }
  }

  const cleanUrl = report.url
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  return (
    <div className="rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <Link
          href={`/report/${report._id}`}
          className="min-w-0 flex-1 transition hover:opacity-80"
        >
          <p className="truncate text-sm font-medium text-charcoal">
            {cleanUrl}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatDate(report.createdAt)}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          {report.status === "success" && (
            <span className="text-lg font-bold text-teal">
              {report.overallScore}/100
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[report.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {report.status}
          </span>
          {report.status === "rate_limited" && (
            <button
              type="button"
              onClick={handleRerun}
              disabled={isReRunning}
              className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isReRunning ? "Running…" : "Reset & re-run"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="border-t border-border bg-red-50 px-5 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
