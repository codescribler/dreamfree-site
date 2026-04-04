import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { setVerificationCookie } from "@/lib/report-cookie";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { code } = body as { code: string };

  if (!code || code.length !== 6) {
    return NextResponse.json(
      { error: "invalid_code", message: "Please enter a 6-digit code." },
      { status: 400 },
    );
  }

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

  if (report.verifyCode !== code) {
    return NextResponse.json(
      {
        error: "wrong_code",
        message: "That code doesn't match. Check your email and try again.",
      },
      { status: 403 },
    );
  }

  // Mark as verified in Convex if still public
  if (report.accessLevel === "public") {
    await convex.mutation(api.signalReports.markVerified, {
      reportId: id as Id<"signalReports">,
    });
  }

  // Set verification cookie
  await setVerificationCookie(id);

  return NextResponse.json({ success: true });
}
