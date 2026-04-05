import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@") && e.includes("."));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { emails, message, sharerName, sharerEmail } = body as {
    emails: string;
    message?: string;
    sharerName: string;
    sharerEmail: string;
  };

  if (!emails || !sharerName || !sharerEmail) {
    return NextResponse.json(
      { error: "missing_fields", message: "Please fill in all required fields." },
      { status: 400 },
    );
  }

  const parsedEmails = parseEmails(emails);
  if (parsedEmails.length === 0) {
    return NextResponse.json(
      { error: "no_valid_emails", message: "Please enter at least one valid email address." },
      { status: 400 },
    );
  }

  if (parsedEmails.length > 10) {
    return NextResponse.json(
      { error: "too_many_emails", message: "You can share with up to 10 people at a time." },
      { status: 400 },
    );
  }

  // Fetch report
  let report;
  try {
    report = await convex.query(api.signalReports.getById, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!report || report.status !== "success") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Process each recipient — reuse the existing verifyToken for the magic link
  const results: { email: string; success: boolean }[] = [];

  for (const recipientEmail of parsedEmails) {
    try {
      // Create/upsert recipient as a lead
      await convex.mutation(api.leads.upsertLeadPublic, {
        email: recipientEmail,
        website: report.url,
        source: "shared_report",
      });

      // Send email with existing verifyToken
      await convex.action(api.emails.sendShareEmail, {
        recipientEmail,
        sharerName,
        sharerMessage: message || undefined,
        url: report.url,
        overallScore: report.overallScore,
        reportId: id,
        verifyToken: report.verifyToken,
      });

      results.push({ email: recipientEmail, success: true });
    } catch (err) {
      console.error(`Share failed for ${recipientEmail}:`, err);
      results.push({ email: recipientEmail, success: false });
    }
  }

  // Send log email to Daniel
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const recipientList = results
      .map((r) => `${r.email} — ${r.success ? "sent" : "FAILED"}`)
      .join("<br />");

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dreamfree <notifications@dreamfree.co.uk>",
        to: "daniel@dreamfree.co.uk",
        subject: `[Share Log] ${sharerName} shared ${report.url} with ${parsedEmails.length} people`,
        html: `
          <h2>Report Shared</h2>
          <p><strong>Shared by:</strong> ${sharerName} (${sharerEmail})</p>
          <p><strong>Report:</strong> ${report.url} — ${report.overallScore}/100</p>
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
          <hr />
          <p><strong>Recipients:</strong></p>
          <p>${recipientList}</p>
        `,
      }),
    }).catch((err) => console.error("Share log email failed:", err));
  }

  const successCount = results.filter((r) => r.success).length;

  return NextResponse.json({
    success: true,
    count: successCount,
    message:
      successCount === parsedEmails.length
        ? `Report shared with ${successCount} ${successCount === 1 ? "person" : "people"}.`
        : `Shared with ${successCount} of ${parsedEmails.length} recipients. Some emails may have failed.`,
  });
}
