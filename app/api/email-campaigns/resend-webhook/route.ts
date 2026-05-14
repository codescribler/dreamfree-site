import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Resend event type → the eventType the Convex mutation accepts. */
const EVENT_MAP: Record<
  string,
  "delivered" | "opened" | "clicked" | "bounced" | "complained"
> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    click?: { link?: string };
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SIGNING_SECRET is not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const payload = await req.text();
  const svixHeaders = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(payload, svixHeaders) as ResendEvent;
  } catch (err) {
    console.error("Resend webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const mapped = event.type ? EVENT_MAP[event.type] : undefined;
  if (!mapped) {
    // email.sent, email.delivery_delayed, etc. — acknowledge without acting.
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }

  const resendId = event.data?.email_id;
  if (!resendId) {
    return NextResponse.json({ error: "missing_email_id" }, { status: 400 });
  }

  const occurredAt =
    Date.parse(event.created_at ?? event.data?.created_at ?? "") || Date.now();
  const clickedUrl =
    mapped === "clicked" ? event.data?.click?.link : undefined;

  try {
    await convex.mutation(api.emailCampaignsInbound.recordResendEvent, {
      webhookSecret: secret,
      eventType: mapped,
      resendId,
      occurredAt,
      clickedUrl,
    });
  } catch (err) {
    console.error("recordResendEvent failed:", err);
    return NextResponse.json({ error: "convex_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
