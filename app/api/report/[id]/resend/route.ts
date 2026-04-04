import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { randomInt, randomBytes } from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { email } = body as { email: string };

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
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

  if (!data?.report || !data?.lead || data.report.accessLevel !== "public") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Generate new verification credentials
  const verifyCode = String(randomInt(100000, 999999));
  const verifyToken = randomBytes(32).toString("base64url");

  // Update credentials on the report
  await convex.mutation(api.signalReports.updateVerifyCredentials, {
    reportId: id as Id<"signalReports">,
    verifyCode,
    verifyToken,
  });

  // Update the lead's email if it changed
  if (email.toLowerCase() !== data.lead.email.toLowerCase()) {
    await convex.mutation(api.leads.upsertLeadPublic, {
      email,
      firstName: data.lead.firstName,
      website: data.lead.website,
      source: "signal_score",
    });
  }

  // Send the verification email to the new address
  convex
    .action(api.emails.sendSignalScoreToVisitor, {
      firstName: data.lead.firstName || "there",
      email,
      url: data.report.url,
      overallScore: data.report.overallScore,
      gruntTestPass: data.report.gruntTest.pass,
      reportId: id,
      verifyCode,
      verifyToken,
    })
    .catch((err) => console.error("Resend verification email failed:", err));

  return NextResponse.json({ success: true });
}
