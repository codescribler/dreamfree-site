/**
 * Friendly failure UI for the report page. Replaces the bare notFound() that
 * was showing as a 404 for any non-success status.
 *
 * Server component: the only interactivity is plain HTML <form> POSTs to
 * /api/report/[id]/retry, which works without JavaScript.
 */

type FailureStatus = "fetch_failed" | "llm_failed" | "rate_limited";

interface ReportFailedProps {
  reportId: string;
  url: string;
  status: FailureStatus;
}

/** Suggest sensible URL variations when a fetch failed. */
function urlVariations(url: string): string[] {
  const variants: string[] = [];
  try {
    // Normalise to a parseable URL.
    const withScheme = url.startsWith("http") ? url : `https://${url}`;
    const u = new URL(withScheme);
    const host = u.hostname;

    if (host.startsWith("www.")) {
      const stripped = host.slice(4);
      variants.push(`https://${stripped}${u.pathname === "/" ? "" : u.pathname}`);
    } else {
      variants.push(`https://www.${host}${u.pathname === "/" ? "" : u.pathname}`);
    }

    if (u.protocol === "http:") {
      variants.push(`https://${host}${u.pathname === "/" ? "" : u.pathname}`);
    }
  } catch {
    // Unparseable URL — no variants.
  }
  // De-dupe and exclude the original URL.
  const normalised = url.replace(/\/$/, "");
  return Array.from(new Set(variants)).filter((v) => v !== normalised);
}

export function ReportFailed({ reportId, url, status }: ReportFailedProps) {
  const cleanUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const retryAction = `/api/report/${reportId}/retry`;

  // Per-status content.
  let headline: string;
  let body: React.ReactNode;
  let showRetry = false;
  let showVariations = false;

  if (status === "fetch_failed") {
    headline = "We couldn't load that site";
    body = (
      <>
        <p>
          Our scanner couldn&rsquo;t reach <strong>{cleanUrl}</strong>. This usually
          means one of three things:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>The site is blocking automated readers</li>
          <li>The address has a typo or is missing the <code>www.</code> prefix</li>
          <li>A short network blip — these often clear on a second try</li>
        </ul>
      </>
    );
    showRetry = true;
    showVariations = true;
  } else if (status === "llm_failed") {
    headline = "Our analysis hit a snag";
    body = (
      <p>
        We got to <strong>{cleanUrl}</strong> just fine, but the AI scoring didn&rsquo;t
        complete. This is almost always a transient blip on the model side and clears
        on a retry.
      </p>
    );
    showRetry = true;
  } else {
    // rate_limited
    headline = "You&rsquo;ve already used your free reports today";
    body = (
      <p>
        We limit free Signal Scores per person per day to keep things fair. Try
        again tomorrow, or get in touch if you need a one-off bump.
      </p>
    );
  }

  const variations = showVariations ? urlVariations(url) : [];

  return (
    <main className="mx-auto max-w-[640px] px-[clamp(1.25rem,4vw,3rem)] pt-28 pb-24 text-charcoal">
      <div className="mb-8 text-center">
        <span className="mb-3 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
          Signal Report
        </span>
        <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold tracking-tight">
          {headline.includes("&rsquo;") ? (
            <span dangerouslySetInnerHTML={{ __html: headline }} />
          ) : (
            headline
          )}
        </h1>
      </div>

      <div className="rounded-2xl border border-[#e2e1dc] bg-cream p-6 text-[15px] leading-7 text-charcoal">
        {body}

        {showRetry && (
          <form method="POST" action={retryAction} className="mt-6">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full bg-teal px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              Try again
            </button>
          </form>
        )}

        {showVariations && variations.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Or try with a slightly different address
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {variations.map((v) => (
                <form
                  key={v}
                  method="POST"
                  action={`${retryAction}?url=${encodeURIComponent(v)}`}
                >
                  <button
                    type="submit"
                    className="text-left text-sm font-medium text-teal underline-offset-2 hover:underline"
                  >
                    {v.replace(/^https?:\/\//, "")}
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-[#e2e1dc] bg-white p-5 text-sm leading-6 text-[#4a4a68]">
        <p>
          <strong>Daniel has been notified</strong> and will reach out. If you&rsquo;d
          rather not wait, drop him a line directly at{" "}
          <a
            href="mailto:daniel@dreamfree.co.uk"
            className="text-teal hover:underline"
          >
            daniel@dreamfree.co.uk
          </a>
          .
        </p>
      </div>
    </main>
  );
}
