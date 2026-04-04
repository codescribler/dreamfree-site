import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
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
  const { password } = body as { password: string };

  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  // Get the report and lead to find the email
  let data;
  try {
    data = await convex.query(api.signalReports.getByIdWithLead, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!data?.report || !data?.lead || data.report.accessLevel !== "verified") {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  if (data.report.clerkUserId) {
    return NextResponse.json({ error: "account_exists" }, { status: 400 });
  }

  try {
    const clerk = await clerkClient();
    const user = await clerk.users.createUser({
      emailAddress: [data.lead.email],
      password,
      firstName: data.lead.firstName || undefined,
    });

    await convex.mutation(api.signalReports.linkClerkUser, {
      reportId: id as Id<"signalReports">,
      clerkUserId: user.id,
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create account.";
    console.error("Clerk account creation failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
