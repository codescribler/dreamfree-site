"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type Status = Doc<"demoRequests">["status"];

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "requested", label: "Requested" },
  { value: "in_progress", label: "In Progress" },
  { value: "demo_complete", label: "Delivered (built)" },
  { value: "notification_sent", label: "Delivered (customer notified)" },
  { value: "customer_reviewed", label: "Viewed" },
  { value: "followed_up", label: "Followed up" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

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

function prettyHost(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

type Column = {
  key: "requested" | "inProgress" | "ready" | "delivered" | "viewed";
  label: string;
  accent: string;
  primaryAction: { label: string; status: Status } | null;
};

const COLUMNS: Column[] = [
  {
    key: "requested",
    label: "Requested",
    accent: "border-amber-300 bg-amber-50",
    primaryAction: { label: "Start →", status: "in_progress" },
  },
  {
    key: "inProgress",
    label: "In Progress",
    accent: "border-blue-300 bg-blue-50",
    primaryAction: { label: "Mark ready →", status: "demo_complete" },
  },
  {
    key: "ready",
    label: "Ready",
    accent: "border-indigo-300 bg-indigo-50",
    primaryAction: { label: "Mark delivered →", status: "notification_sent" },
  },
  {
    key: "delivered",
    label: "Delivered",
    accent: "border-purple-300 bg-purple-50",
    primaryAction: { label: "Mark viewed →", status: "customer_reviewed" },
  },
  {
    key: "viewed",
    label: "Viewed",
    accent: "border-teal-300 bg-teal/5",
    primaryAction: null, // viewed cards get Won/Lost buttons instead
  },
];

export default function DemoBoardPage() {
  const board = useQuery(api.demoRequests.board, {});
  const updateStatus = useMutation(api.demoRequests.updateStatus);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(requestId: Id<"demoRequests">, status: Status) {
    if (busyId) return;
    setBusyId(requestId);
    try {
      await updateStatus({ requestId, status });
    } catch (err) {
      console.error("updateStatus failed", err);
      alert("Failed to update status. Check console.");
    } finally {
      setBusyId(null);
    }
  }

  if (board === undefined) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-charcoal">Demo Requests</h1>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const total =
    board.requested.length +
    board.inProgress.length +
    board.ready.length +
    board.delivered.length +
    board.viewed.length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">Demo Requests</h1>
          <p className="mt-1 text-sm text-muted">
            {total} active. Move cards across columns as each demo progresses.
          </p>
        </div>
        <div className="flex gap-3 text-xs text-muted">
          <span>
            Followed up:{" "}
            <span className="font-semibold text-charcoal">
              {board.archive.followedUp}
            </span>
          </span>
          <span>
            Won:{" "}
            <span className="font-semibold text-emerald-600">
              {board.archive.won}
            </span>
          </span>
          <span>
            Lost:{" "}
            <span className="font-semibold text-rose-600">
              {board.archive.lost}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = board[col.key];
          return (
            <div
              key={col.key}
              className={`rounded-xl border-2 p-3 ${col.accent}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-charcoal">
                  {col.label}
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-charcoal">
                  {items.length}
                </span>
              </div>

              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted">
                  No demos here.
                </p>
              ) : (
                <div className="space-y-3">
                  {items.map((req: Doc<"demoRequests">) => (
                    <DemoCard
                      key={req._id}
                      request={req}
                      busy={busyId === req._id}
                      primaryAction={col.primaryAction}
                      isViewedCol={col.key === "viewed"}
                      onAction={(s) => setStatus(req._id, s)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DemoCard({
  request,
  busy,
  primaryAction,
  isViewedCol,
  onAction,
}: {
  request: Doc<"demoRequests">;
  busy: boolean;
  primaryAction: { label: string; status: Status } | null;
  isViewedCol: boolean;
  onAction: (status: Status) => void;
}) {
  const host = prettyHost(request.website);
  return (
    <div className="rounded-lg border border-border bg-white p-3 shadow-sm">
      <Link
        href={`/dashboard/leads/${request.leadId}`}
        className="block"
      >
        <p className="truncate font-semibold text-charcoal hover:text-teal hover:underline">
          {request.businessName || request.firstName || request.email}
        </p>
        {request.businessName && request.firstName ? (
          <p className="truncate text-xs text-muted">
            {request.firstName}
            {request.industry ? ` · ${request.industry}` : ""}
          </p>
        ) : request.industry ? (
          <p className="truncate text-xs text-muted">{request.industry}</p>
        ) : null}
      </Link>

      {host ? (
        <p className="mt-2 truncate font-mono text-xs text-charcoal">
          {host}
        </p>
      ) : null}

      {request.demoUrl ? (
        <a
          href={request.demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1 truncate rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          <span aria-hidden>↗</span>
          <span className="truncate">{prettyHost(request.demoUrl)}</span>
        </a>
      ) : null}

      {request.mainGoal ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted">
          <span className="font-medium text-charcoal">Goal:</span>{" "}
          {request.mainGoal}
        </p>
      ) : null}

      {request.idealCustomer ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted">
          <span className="font-medium text-charcoal">Ideal customer:</span>{" "}
          {request.idealCustomer}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {timeAgo(request.updatedAt)}
        </span>
        {isViewedCol ? (
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("won")}
              className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              Won
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("lost")}
              className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
            >
              Lost
            </button>
          </div>
        ) : primaryAction ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(primaryAction.status)}
            className="rounded-md border border-charcoal/15 bg-white px-2 py-1 text-xs font-semibold text-charcoal transition-colors hover:border-teal hover:text-teal disabled:opacity-50"
          >
            {busy ? "…" : primaryAction.label}
          </button>
        ) : null}
      </div>

      {/* Escape hatch for any backwards / off-path move */}
      <div className="mt-2">
        <select
          aria-label="Change status"
          disabled={busy}
          value={request.status}
          onChange={(e) => {
            const next = e.target.value as Status;
            if (next !== request.status) onAction(next);
          }}
          className="w-full rounded border border-border bg-white px-2 py-1 text-xs text-muted hover:text-charcoal"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Status: {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
