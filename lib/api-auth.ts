import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { createHash } from "crypto";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export interface ApiAuthContext {
  keyId: Id<"apiKeys">;
  name: string;
}

const UNAUTHORIZED = NextResponse.json(
  { error: "unauthorized" },
  { status: 401 },
);

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Validate the bearer token on an incoming request.
 * Returns either an ApiAuthContext (the key is valid + active) or a
 * NextResponse 401 the route handler should return immediately.
 */
export async function authenticateApiRequest(
  req: NextRequest,
): Promise<ApiAuthContext | NextResponse> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return UNAUTHORIZED;
  }
  const raw = header.slice(7).trim();
  if (!raw) return UNAUTHORIZED;

  const keyHash = hashKey(raw);
  const result = await convex.mutation(api.apiKeys.verifyAndTouch, { keyHash });
  if (!result) return UNAUTHORIZED;

  return { keyId: result.keyId, name: result.name };
}

/** Type guard for routes that prefer a discriminated check. */
export function isAuthFailure(
  v: ApiAuthContext | NextResponse,
): v is NextResponse {
  return v instanceof NextResponse;
}
