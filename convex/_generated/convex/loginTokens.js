import { v } from "convex/values";
import { mutation } from "./_generated/server";
const TOKEN_TTL_MS = 15 * 60 * 1000;
export const createLoginToken = mutation({
    args: {
        email: v.string(),
        tokenHash: v.string(),
    },
    handler: async (ctx, args) => {
        const email = args.email.toLowerCase();
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();
        if (!user || !user.isAdmin) {
            return { issued: false };
        }
        const now = Date.now();
        await ctx.db.insert("loginTokens", {
            email,
            tokenHash: args.tokenHash,
            expiresAt: now + TOKEN_TTL_MS,
            createdAt: now,
        });
        return { issued: true };
    },
});
export const consumeLoginToken = mutation({
    args: {
        tokenHash: v.string(),
    },
    handler: async (ctx, args) => {
        const record = await ctx.db
            .query("loginTokens")
            .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
            .first();
        if (!record)
            return null;
        if (record.usedAt)
            return null;
        if (record.expiresAt < Date.now())
            return null;
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", record.email))
            .first();
        if (!user || !user.isAdmin)
            return null;
        await ctx.db.patch(record._id, { usedAt: Date.now() });
        return { email: user.email, isAdmin: user.isAdmin };
    },
});
