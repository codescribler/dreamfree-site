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

  // Send notification email to Daniel
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const reportLink = `${siteUrl}/report/${id}`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dreamfree <notifications@dreamfree.co.uk>",
        to: "daniel@dreamfree.co.uk",
        reply_to: data.lead.email,
        subject: `🏠 Free homepage demo requested: ${data.lead.firstName || "Someone"} (${data.report.overallScore}/100)`,
        html: `
          <h2>Free Homepage Demo Requested</h2>
          <p>A lead has seen their Signal Score report and wants to see what their homepage could look like.</p>
          <hr />
          <p><strong>Name:</strong> ${data.lead.firstName || "Unknown"}</p>
          <p><strong>Email:</strong> ${data.lead.email}</p>
          ${data.lead.phone ? `<p><strong>Phone:</strong> ${data.lead.phone}</p>` : ""}
          <p><strong>Website:</strong> <a href="${data.report.url}">${data.report.url}</a></p>
          <p><strong>Signal Score:</strong> ${data.report.overallScore}/100</p>
          <p><a href="${reportLink}">View their report</a></p>
          <hr />
          <p style="color:#7b7b96;font-size:13px;">This is a high-intent lead — they've read their report and clicked "Show me what my homepage could look like." Move fast.</p>
        `,
      }),
    }).catch((err) => console.error("Demo request email failed:", err));
  }

  return NextResponse.json({ success: true });
}
