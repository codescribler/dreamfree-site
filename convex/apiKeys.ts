import { v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Create a new API key. Generates a 32-byte random key, stores only the
 * SHA-256 hash, and returns the raw key once. The raw value cannot be
 * retrieved again — save it now.
 */
export const createKey = action({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<{ id: string; key: string }> => {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const key = bytesToHex(raw);
    const keyHash = await sha256Hex(key);

    const id: string = await ctx.runMutation(internal.apiKeys.insertKey, {
      name: args.name,
      keyHash,
    });

    return { id, key };
  },
});

export const insertKey = internalMutation({
  args: { name: v.string(), keyHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("apiKeys", {
      name: args.name,
      keyHash: args.keyHash,
      createdAt: Date.now(),
    });
  },
});

export const listKeys = query({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db.query("apiKeys").collect();
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      lastCalledAt: k.lastCalledAt,
      revokedAt: k.revokedAt,
      createdAt: k.createdAt,
    }));
  },
});

export const revokeKey = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { revokedAt: Date.now() });
  },
});

/**
 * Verify an incoming key hash, return the previous lastCalledAt (so the
 * caller knows what window to query), and stamp the new lastCalledAt.
 * Returns null if the key is unknown or revoked.
 */
export const verifyAndTouch = mutation({
  args: { keyHash: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .first();

    if (!record || record.revokedAt) return null;

    const previousLastCalledAt = record.lastCalledAt;
    const now = Date.now();
    await ctx.db.patch(record._id, { lastCalledAt: now });

    return {
      keyId: record._id,
      name: record.name,
      previousLastCalledAt,
      now,
    };
  },
});

/**
 * Like listKeys but each row is augmented with reportCount — the number
 * of signalReports rows whose createdViaApiKeyId matches the key.
 */
export const listKeysWithStats = query({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db.query("apiKeys").collect();
    const enriched = await Promise.all(
      keys.map(async (k) => {
        const reports = await ctx.db
          .query("signalReports")
          .withIndex("by_createdViaApiKeyId", (q) =>
            q.eq("createdViaApiKeyId", k._id),
          )
          .collect();
        return {
          _id: k._id,
          name: k.name,
          lastCalledAt: k.lastCalledAt,
          revokedAt: k.revokedAt,
          createdAt: k.createdAt,
          reportCount: reports.length,
        };
      }),
    );
    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});
