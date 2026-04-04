import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { phone } = body as { phone: string };

  if (!phone || phone.trim().length < 5) {
    return NextResponse.json(
      { error: "Please enter a valid phone number." },
      { status: 400 },
    );
  }

  let data;
  try {
    data = await convex.query(api.signalReports.getByIdWithLead, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!data?.report || !data?.lead) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await convex.mutation(api.callbackRequests.create, {
    leadId: data.report.leadId,
    reportId: id as Id<"signalReports">,
    phone: phone.trim(),
  });

  // Notify Daniel
  convex
    .action(api.emails.sendCallbackNotification, {
      firstName: data.lead.firstName || "Unknown",
      email: data.lead.email,
      phone: phone.trim(),
      url: data.report.url,
      overallScore: data.report.overallScore,
      reportId: id,
    })
    .catch((err) => console.error("Callback notification failed:", err));

  return NextResponse.json({ success: true });
}
