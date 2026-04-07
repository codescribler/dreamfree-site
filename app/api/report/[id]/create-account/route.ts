import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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

  if (data.report.userId) {
    return NextResponse.json({ error: "account_exists" }, { status: 400 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const userId = await convex.mutation(api.users.createUser, {
      email: data.lead.email,
      passwordHash,
      isAdmin: false,
    });

    await convex.mutation(api.signalReports.linkUser, {
      reportId: id as Id<"signalReports">,
      userId: userId as string,
    });

    return NextResponse.json({ success: true, userId });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create account.";
    console.error("Account creation failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
