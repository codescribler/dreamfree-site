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
  api_outbound: "Outbound (API)",
};

const SOURCE_COLOURS: Record<string, string> = {
  course_signup: "bg-purple-100 text-purple-700",
  email_capture: "bg-blue-100 text-blue-700",
  contact_form: "bg-green-100 text-green-700",
  signal_score: "bg-amber-100 text-amber-700",
  api_outbound: "bg-slate-100 text-slate-700",
};

const EVENT_LABELS: Record<string, string> = {
  page_view: "Viewed",
  scroll_depth: "Scrolled",
  form_submission: "Submitted",
  signal_score_started: "Started Signal Score",
  signal_score_completed: "Completed Signal Score",
  cta_click: "Clicked CTA",
  outbound_report_viewed: "Opened their report",
};

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

function isEngaged(lead: Doc<"leads">): boolean {
  return (
    lead.sources.includes("api_outbound") && lead.firstEngagedAt != null
  );
}

type LeadStub = {
  _id: string;
  email: string;
  firstName?: string;
  name?: string;
};

type EventProps = Record<string, unknown>;

function getString(p: EventProps, key: string): string | null {
  const v = p[key];
  return typeof v === "string" ? v : null;
}

function getNumber(p: EventProps, key: string): number | null {
  const v = p[key];
  return typeof v === "number" ? v : null;
}

function prettyHost(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function activityLine(
  event: Doc<"events">,
  leadStub: LeadStub | null,
): { who: string; what: string; target: string | null } {
  const props = (event.properties ?? {}) as EventProps;
  const whoFromProps =
    getString(props, "firstName") ?? getString(props, "email");
  const who =
    whoFromProps ??
    (leadStub
      ? leadStub.firstName ?? leadStub.name ?? leadStub.email
      : "Anonymous");

  switch (event.type) {
    case "outbound_report_viewed": {
      const url = getString(props, "url");
      const viewCount = getNumber(props, "viewCount") ?? 1;
      return {
        who,
        what: `opened their report — view #${viewCount}`,
        target: url ? prettyHost(url) : null,
      };
    }
    case "scroll_depth": {
      const depth = getNumber(props, "depth");
      const url = getString(props, "url");
      const onReport = event.path.startsWith("/report/");
      return {
        who,
        what: depth != null
          ? onReport
            ? `scrolled ${depth}% through their report`
            : `scrolled ${depth}%`
          : onReport
            ? "scrolled through their report"
            : "scrolled",
        target: url ? prettyHost(url) : event.path,
      };
    }
    case "page_view": {
      const url = getString(props, "url");
      const onReport = event.path.startsWith("/report/");
      return {
        who,
        what: onReport ? "viewed their report" : "viewed",
        target: url ? prettyHost(url) : event.path,
      };
    }
    case "cta_click": {
      const label = getString(props, "label");
      return {
        who,
        what: label ? `clicked "${label}"` : "clicked a CTA",
        target: event.path,
      };
    }
    case "form_submission": {
      const formType = getString(props, "type");
      return {
        who,
        what: formType ? `submitted the ${formType} form` : "submitted a form",
        target: event.path,
      };
    }
    case "signal_score_started":
      return { who, what: "started a Signal Score audit", target: null };
    case "signal_score_completed":
      return { who, what: "completed a Signal Score audit", target: null };
    default:
      return { who, what: event.type, target: event.path };
  }
}

export default function DashboardPage() {
  const leads = useQuery(api.leads.list, { limit: 50 });
  const recentActivity = useQuery(api.events.recentActivity, { limit: 25 });
  const engaged = useQuery(api.leads.listOutbound, {
    filter: "engaged",
    limit: 10,
  });

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

      {/* Engaged Outbound — highest-priority panel */}
      {engaged && engaged.length > 0 ? (
        <section>
          <h2 className="mb-4 text-lg font-bold text-charcoal">
            🔥 Clicked through — {engaged.length} engaged outbound{" "}
            {engaged.length === 1 ? "lead" : "leads"}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {engaged.map(({ lead, report, apiKeyName }) => (
              <Link
                key={lead._id}
                href={`/dashboard/leads/${lead._id}`}
                className="block rounded-xl border border-teal/40 bg-white p-4 shadow-sm ring-1 ring-teal/15 transition-colors hover:border-teal hover:ring-teal/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-charcoal">
                      {lead.firstName || lead.name || lead.email}
                    </p>
                    <p className="truncate text-xs text-muted">{lead.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold text-teal">
                    ×{lead.engagementCount ?? 1}
                  </span>
                </div>
                {report ? (
                  <p className="mt-2 truncate text-sm text-charcoal">
                    {report.url
                      .replace(/^https?:\/\//, "")
                      .replace(/\/$/, "")}
                    {report.status === "success" ? (
                      <span className="ml-2 font-mono text-xs text-muted">
                        {report.overallScore}/100
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span>
                    Last opened {timeAgo(lead.lastEngagedAt ?? undefined)}
                  </span>
                  {apiKeyName ? <span>{apiKeyName}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

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
                  leads.map((lead: Doc<"leads">) => {
                    const engagedRow = isEngaged(lead);
                    return (
                      <tr
                        key={lead._id}
                        className={`border-b border-border last:border-b-0 hover:bg-warm-grey/30 ${
                          engagedRow ? "bg-teal/5" : ""
                        }`}
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
                            {engagedRow ? (
                              <span className="inline-block rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold text-teal">
                                Outbound — Viewed ×{lead.engagementCount ?? 1}
                              </span>
                            ) : null}
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
                    );
                  })
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
          {recentActivity === undefined ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : recentActivity.events.length === 0 ? (
            <p className="text-sm text-muted">
              No activity yet. Events will appear as visitors browse the site.
            </p>
          ) : (
            recentActivity.events.map((event: Doc<"events">) => {
              const isClickThrough = event.type === "outbound_report_viewed";
              const leadStub = event.leadId
                ? recentActivity.leadsByLeadId[event.leadId] ?? null
                : null;
              const { who, what, target } = activityLine(event, leadStub);

              const rowBody = (
                <>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                      isClickThrough
                        ? "bg-teal/20 text-teal"
                        : "bg-teal/10 text-teal"
                    }`}
                  >
                    {EVENT_LABELS[event.type] ?? event.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-charcoal">
                    <span className="font-medium">{who}</span>
                    <span className="text-muted"> {what}</span>
                  </span>
                  {target ? (
                    <span
                      className={`hidden shrink-0 truncate rounded-md px-2 py-0.5 font-mono text-xs sm:inline-block sm:max-w-[16rem] ${
                        isClickThrough
                          ? "bg-teal/10 text-teal"
                          : "bg-warm-grey text-charcoal"
                      }`}
                      title={target}
                    >
                      {target}
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-xs text-muted">
                    {timeAgo(event.timestamp)}
                  </span>
                </>
              );

              const className = `flex items-center gap-3 rounded-lg border bg-white px-4 py-3 text-sm ${
                isClickThrough
                  ? "border-teal/40 ring-1 ring-teal/20"
                  : "border-border"
              }`;

              return leadStub ? (
                <Link
                  key={event._id}
                  href={`/dashboard/leads/${leadStub._id}`}
                  className={`${className} hover:bg-warm-grey/30`}
                >
                  {rowBody}
                </Link>
              ) : (
                <div key={event._id} className={className}>
                  {rowBody}
                </div>
              );
            })
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
