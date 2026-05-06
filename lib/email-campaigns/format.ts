/** "5m ago" / "2h ago" / "3d ago" — matches existing dashboard pattern. */
export function timeAgo(timestamp: number | undefined): string {
  if (timestamp === undefined) return "—";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 0) {
    // Future timestamp — show "in Xm" / "in Xh" / "in Xd"
    return `in ${formatRelativeFuture(-seconds)}`;
  }
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatRelativeFuture(seconds: number): string {
  if (seconds < 60) return "<1m";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** "1 Jun 2026, 14:32" UK style. */
export function formatDate(timestamp: number | undefined): string {
  if (timestamp === undefined) return "—";
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Convert ms gap to a human-readable cadence label. */
export function formatGap(ms: number): string {
  if (ms === 0) return "immediate";
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** Parse a free-form cadence input ("2 days", "1d", "3h", "30 min") into ms. */
export function parseGap(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "" || trimmed === "0" || trimmed === "immediate") return 0;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(min|m|hour|hours|h|day|days|d)?$/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2] ?? "day";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (unit.startsWith("min") || unit === "m") return Math.round(value * minute);
  if (unit.startsWith("h")) return Math.round(value * hour);
  return Math.round(value * day);
}
