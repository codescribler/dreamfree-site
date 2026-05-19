import { v } from "convex/values";
import { query } from "./_generated/server";
function windowQuery(ctx, table, since, until) {
    const builder = (q) => {
        const r = q;
        return r.gte("_creationTime", since).lt("_creationTime", until);
    };
    const queryBuilder = ctx.db.query(table);
    return queryBuilder.withIndex("by_creation_time", builder).collect();
}
/**
 * Returns every record from every business-relevant table where
 * `_creationTime` falls in [since, until). Also returns a `leadsReferenced`
 * map covering every leadId mentioned in any returned row, so the caller
 * can join on email/name without a second request.
 */
export const getActivity = query({
    args: {
        since: v.number(),
        until: v.number(),
    },
    handler: async (ctx, args) => {
        const { since, until } = args;
        const [leadsRaw, events, formSubmissions, signalReportsRaw, contentPlans, callbackRequests, demoRequests, emailEnrollments, emailSends, tags, leadTags,] = await Promise.all([
            windowQuery(ctx, "leads", since, until),
            windowQuery(ctx, "events", since, until),
            windowQuery(ctx, "formSubmissions", since, until),
            windowQuery(ctx, "signalReports", since, until),
            windowQuery(ctx, "contentPlans", since, until),
            windowQuery(ctx, "callbackRequests", since, until),
            windowQuery(ctx, "demoRequests", since, until),
            windowQuery(ctx, "emailEnrollments", since, until),
            windowQuery(ctx, "emailSends", since, until),
            windowQuery(ctx, "tags", since, until),
            windowQuery(ctx, "leadTags", since, until),
        ]);
        // Visibility filters — see
        // docs/superpowers/specs/2026-05-18-outbound-lead-visibility-design.md
        // A lead is visible if it is inbound, or outbound-and-engaged.
        // An API report is visible if it has been viewed.
        const leads = leadsRaw.filter((l) => l.leadType !== "outbound" || l.firstEngagedAt != null);
        const signalReports = signalReportsRaw.filter((r) => r.createdViaApiKeyId == null || r.firstViewedAt != null);
        const leadIds = new Set();
        const collectLeadId = (r) => {
            if (r.leadId)
                leadIds.add(r.leadId);
        };
        formSubmissions.forEach(collectLeadId);
        signalReports.forEach(collectLeadId);
        contentPlans.forEach(collectLeadId);
        callbackRequests.forEach(collectLeadId);
        demoRequests.forEach(collectLeadId);
        emailEnrollments.forEach(collectLeadId);
        emailSends.forEach(collectLeadId);
        leadTags.forEach(collectLeadId);
        events.forEach(collectLeadId);
        leads.forEach((l) => leadIds.add(l._id));
        const leadsReferenced = {};
        await Promise.all(Array.from(leadIds).map(async (id) => {
            const doc = await ctx.db.get(id);
            if (!doc)
                return;
            // Re-apply the visibility rule when resolving — never leak a
            // dropped lead via the join map.
            if (doc.leadType === "outbound" && doc.firstEngagedAt == null)
                return;
            leadsReferenced[id] = doc;
        }));
        return {
            windowStart: since,
            windowEnd: until,
            counts: {
                leads: leads.length,
                events: events.length,
                formSubmissions: formSubmissions.length,
                signalReports: signalReports.length,
                contentPlans: contentPlans.length,
                callbackRequests: callbackRequests.length,
                demoRequests: demoRequests.length,
                emailEnrollments: emailEnrollments.length,
                emailSends: emailSends.length,
                tags: tags.length,
                leadTags: leadTags.length,
            },
            leads,
            events,
            formSubmissions,
            signalReports,
            contentPlans,
            callbackRequests,
            demoRequests,
            emailEnrollments,
            emailSends,
            tags,
            leadTags,
            leadsReferenced,
        };
    },
});
