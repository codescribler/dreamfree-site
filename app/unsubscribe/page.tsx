import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { UndoUnsubscribeButton } from "./UndoUnsubscribeButton";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const metadata = {
  title: "Unsubscribe — Dreamfree",
  robots: { index: false, follow: false },
};

const wrap: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  maxWidth: "520px",
  margin: "80px auto",
  padding: "0 24px",
  color: "#1a1a2e",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  // No token at all → generic error, never call Convex.
  if (!t) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: "22px" }}>Link not recognised</h1>
        <p style={{ color: "#4a4a68", lineHeight: 1.7 }}>
          This unsubscribe link is missing or invalid. If you want to stop
          hearing from us, just reply to any email and we&rsquo;ll sort it.
        </p>
      </main>
    );
  }

  // The mutation self-verifies the token and is idempotent — safe to call on render.
  let ok = false;
  try {
    const result = await convex.mutation(
      api.emailCampaignsInbound.processUnsubscribe,
      { token: t },
    );
    ok = result.ok;
  } catch {
    ok = false;
  }

  if (!ok) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: "22px" }}>Link not recognised</h1>
        <p style={{ color: "#4a4a68", lineHeight: 1.7 }}>
          This unsubscribe link is invalid or has expired. If you want to stop
          hearing from us, just reply to any email and we&rsquo;ll sort it.
        </p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: "22px" }}>You&rsquo;re unsubscribed</h1>
      <p style={{ color: "#4a4a68", lineHeight: 1.7 }}>
        You won&rsquo;t hear from us again — no more emails from this sequence.
        Thanks for taking a look.
      </p>
      <UndoUnsubscribeButton token={t} />
    </main>
  );
}
