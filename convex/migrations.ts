import { internalMutation } from "./_generated/server";

/**
 * One-shot: stamp every existing lead as inbound + set consentedAt = createdAt.
 * Run once after the schema fields are deployed. Safe to re-run (idempotent —
 * skips leads that already have a leadType).
 *
 * Run with: npx convex run migrations:backfillLeadType '{}'
 */
export const backfillLeadType = internalMutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    let updated = 0;
    let skipped = 0;
    for (const lead of leads) {
      if (lead.leadType !== undefined) {
        skipped += 1;
        continue;
      }
      await ctx.db.patch(lead._id, {
        leadType: "inbound",
        consentedAt: lead.createdAt,
      });
      updated += 1;
    }
    return { total: leads.length, updated, skipped };
  },
});
