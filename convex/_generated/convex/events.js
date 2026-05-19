import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
/** Log any event (page view, scroll depth, form submission, tool usage, etc). */
export const track = mutation({
    args: {
        type: v.string(),
        anonymousId: v.string(),
        sessionId: v.string(),
        path: v.string(),
        properties: v.optional(v.any()),
        leadId: v.optional(v.id("leads")),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("events", {
            type: args.type,
            anonymousId: args.anonymousId,
            sessionId: args.sessionId,
            path: args.path,
            properties: args.properties ?? {},
            leadId: args.leadId,
            timestamp: Date.now(),
        });
    },
});
/** Get events for a specific lead. */
export const listByLead = query({
    args: {
        leadId: v.id("leads"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        return await ctx.db
            .query("events")
            .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
            .order("desc")
            .take(limit);
    },
});
/** Recent activity across all leads (for dashboard).
 *
 * Returns `{ events, leadsByLeadId }`. Each event is enriched server-side:
 *
 *   1. For events whose `path` matches `/report/<id>`, the report is
 *      resolved and its `url` (the audited website) is stamped into
 *      `event.properties.url` — so the activity row renders the website
 *      name instead of the opaque report id. Applies to `page_view`,
 *      `scroll_depth`, etc. fired by the global useTracking hook as well
 *      as the `outbound_report_viewed` events emitted by recordEngagement
 *      and markEngaged.
 *
 *   2. `leadsByLeadId` maps each referenced leadId to a small lead stub
 *      (email + firstName + name) so the frontend can render "who" without
 *      N extra round-trips.
 */
export const recentActivity = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 30;
        const rawEvents = await ctx.db.query("events").order("desc").take(limit);
        // Resolve any /report/<id> paths to the audited URL, in one batch so
        // identical report ids only hit the DB once.
        const reportPathRe = /^\/report\/([a-z0-9]+)/i;
        const reportIds = new Set();
        for (const e of rawEvents) {
            const props = (e.properties ?? {});
            const propUrl = typeof props.url === "string" ? props.url : null;
            if (propUrl)
                continue; // already enriched (outbound_report_viewed)
            const match = e.path.match(reportPathRe);
            if (match)
                reportIds.add(match[1]);
        }
        const reportUrlById = {};
        await Promise.all(Array.from(reportIds).map(async (id) => {
            try {
                const report = await ctx.db.get(id);
                if (report)
                    reportUrlById[id] = report.url;
            }
            catch {
                // Bad id, skip.
            }
        }));
        const events = rawEvents.map((e) => {
            const props = (e.properties ?? {});
            if (typeof props.url === "string" && props.url.length > 0)
                return e;
            const match = e.path.match(reportPathRe);
            if (!match)
                return e;
            const url = reportUrlById[match[1]];
            if (!url)
                return e;
            return {
                ...e,
                properties: { ...props, url, reportId: match[1] },
            };
        });
        const leadIds = new Set();
        for (const e of events) {
            if (e.leadId)
                leadIds.add(e.leadId);
        }
        const leadsByLeadId = {};
        await Promise.all(Array.from(leadIds).map(async (id) => {
            const lead = await ctx.db.get(id);
            if (!lead)
                return;
            leadsByLeadId[id] = {
                _id: lead._id,
                email: lead.email,
                firstName: lead.firstName,
                name: lead.name,
            };
        }));
        return { events, leadsByLeadId };
    },
});
