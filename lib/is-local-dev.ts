/**
 * Returns true when running in local development — either Next.js is in
 * development mode, OR we're on a localhost / private-network hostname even
 * when serving a production build (e.g. `next start` after `next build`).
 *
 * Used to suppress all analytics so dev sessions don't pollute real metrics.
 */
export function isLocalDev(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}
