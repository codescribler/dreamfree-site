"use client";

interface Stats {
  enrollments: {
    generating: number;
    pending_approval: number;
    approved: number;
    paused: number;
    stopped: number;
    completed: number;
    unsubscribed: number;
    generation_failed: number;
  };
  pausedDueToReply: number;
  sends: {
    total: number;
    opened: number;
    clicked: number;
    openRatePct: number;
    clickRatePct: number;
  };
  unsubscribed: number;
}

export function StatsGrid({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <div className="rounded-xl border border-border bg-white p-5 text-sm text-muted">
        Loading stats…
      </div>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-charcoal">Stats</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Active sequences" value={stats.enrollments.approved} />
        <Stat
          label="Pending approval"
          value={stats.enrollments.pending_approval}
          highlight={stats.enrollments.pending_approval > 0}
        />
        <Stat label="Generating" value={stats.enrollments.generating} />
        <Stat
          label="Generation failed"
          value={stats.enrollments.generation_failed}
          warning={stats.enrollments.generation_failed > 0}
        />
        <Stat label="Emails sent" value={stats.sends.total} />
        <Stat
          label="Open rate"
          value={`${stats.sends.openRatePct.toFixed(0)}%`}
        />
        <Stat
          label="Click rate"
          value={`${stats.sends.clickRatePct.toFixed(0)}%`}
        />
        <Stat label="Replied (paused)" value={stats.pausedDueToReply} />
        <Stat label="Unsubscribed" value={stats.unsubscribed} />
        <Stat label="Completed" value={stats.enrollments.completed} />
        <Stat label="Stopped" value={stats.enrollments.stopped} />
        <Stat label="Paused" value={stats.enrollments.paused} />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
  warning,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  warning?: boolean;
}) {
  const ring = warning
    ? "border-red-300 bg-red-50"
    : highlight
      ? "border-amber-300 bg-amber-50"
      : "border-border bg-white";
  return (
    <div className={`rounded-xl border ${ring} p-4`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-charcoal">{value}</p>
    </div>
  );
}
