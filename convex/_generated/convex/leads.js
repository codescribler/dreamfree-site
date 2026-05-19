import { v } from "convex/values";
import { query, mutation, internalMutation, } from "./_generated/server";
import { internal } from "./_generated/api";
/** Find a lead by email (reusable helper). */
async function getLeadByEmail(ctx, email) {
    return await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
        .first();
}
/**
 * Upsert a lead: find by email or create new.
 * Returns the lead ID. Called internally by form submission mutations.
 */
export const upsertLead = internalMutation({
    args: {
        email: v.string(),
        firstName: v.optional(v.string()),
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        website: v.optional(v.string()),
        source: v.string(),
        anonymousId: v.optional(v.string()),
        signalScore: v.optional(v.number()),
        signalUrl: v.optional(v.string()),
        signalCustomer: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const email = args.email.toLowerCase();
        const existing = await getLeadByEmail(ctx, email);
        if (existing) {
            const updates = { lastSeenAt: now };
            if (args.firstName && !existing.firstName) {
                updates.firstName = args.firstName;
            }
            if (args.name && !existing.name) {
                updates.name = args.name;
            }
            if (args.phone && !existing.phone) {
                updates.phone = args.phone;
            }
            if (args.website && !existing.website) {
                updates.website = args.website;
            }
            if (args.signalScore !== undefined) {
                updates.signalScore = args.signalScore;
                updates.signalUrl = args.signalUrl;
                updates.signalCustomer = args.signalCustomer;
            }
            if (!existing.sources.includes(args.source)) {
                updates.sources = [...existing.sources, args.source];
            }
            if (args.anonymousId && !existing.anonymousIds.includes(args.anonymousId)) {
                updates.anonymousIds = [...existing.anonymousIds, args.anonymousId];
            }
            // Promote outbound → inbound on first form submission. Never the reverse.
            if (existing.leadType === "outbound") {
                updates.leadType = "inbound";
                updates.consentedAt = now;
            }
            await ctx.db.patch(existing._id, updates);
            return existing._id;
        }
        return await ctx.db.insert("leads", {
            email,
            firstName: args.firstName,
            name: args.name,
            phone: args.phone,
            website: args.website,
            anonymousIds: args.anonymousId ? [args.anonymousId] : [],
            sources: [args.source],
            signalScore: args.signalScore,
            signalUrl: args.signalUrl,
            signalCustomer: args.signalCustomer,
            lastSeenAt: now,
            createdAt: now,
            leadType: "inbound",
            consentedAt: now,
        });
    },
});
/**
 * Link all anonymous events to a lead.
 * Called after a form submission identifies a visitor.
 */
export const linkAnonymousEvents = internalMutation({
    args: {
        leadId: v.id("leads"),
        anonymousId: v.string(),
    },
    handler: async (ctx, args) => {
        const events = await ctx.db
            .query("events")
            .withIndex("by_anonymousId", (q) => q.eq("anonymousId", args.anonymousId))
            .collect();
        for (const event of events) {
            if (!event.leadId) {
                await ctx.db.patch(event._id, { leadId: args.leadId });
            }
        }
    },
});
/** List leads, newest first.
 *
 * `visibility`:
 *   - "topLevel" (default) — inbound leads + engaged outbound leads (those who
 *     clicked through their API report). Hides every lead that has been
 *     API-targeted but not yet engaged.
 *   - "all" — every lead, including unengaged outbound.
 *
 * The visibility predicate keys off `sources.includes("api_outbound")` rather
 * than `leadType`. Historic bug: an earlier version of `runReportGeneration`
 * called `submitSignalScore` for every report, which promoted outbound leads
 * to `leadType: "inbound"` even when they had not consented. `sources` is the
 * only retroactively-reliable signal of "came via the API". `firstEngagedAt`
 * comes from `signalReports.recordEngagement` on click-through.
 *
 * Strategy: fetch a 3× sample by createdAt desc and JS-filter. At current
 * lead volume this is cheaper than a compound index and matches the pattern
 * used by countByStatus.
 */
export const list = query({
    args: {
        limit: v.optional(v.number()),
        visibility: v.optional(v.union(v.literal("topLevel"), v.literal("all"))),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        const visibility = args.visibility ?? "topLevel";
        if (visibility === "all") {
            return await ctx.db
                .query("leads")
                .withIndex("by_createdAt")
                .order("desc")
                .take(limit);
        }
        const sample = await ctx.db
            .query("leads")
            .withIndex("by_createdAt")
            .order("desc")
            .take(Math.max(limit * 3, 200));
        const filtered = sample.filter((l) => !l.sources.includes("api_outbound") || l.firstEngagedAt != null);
        return filtered.slice(0, limit);
    },
});
/** Get a single lead by ID. */
export const getById = query({
    args: { leadId: v.id("leads") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.leadId);
    },
});
/**
 * Same visible-leads result as `leads.list`, plus a side-map of engagement
 * signals per lead so the dashboard can surface "what has each lead actually
 * done" inline with the row.
 *
 * Returned shape:
 *   - `leads` — same array `list` returns
 *   - `latestEventByLeadId` — most-recent event per lead, with /report/<id>
 *     paths server-resolved to the audited URL (matches what Recent
 *     Activity shows). Null if no events.
 *   - `engagementByLeadId` — { eventCount, viewedReportCount,
 *     maxScrollDepth, formSubmissionCount, hasDemoRequest,
 *     hasCallbackRequest } per lead. Future lead-scoring will key off
 *     these primitives.
 *
 * Performance: 1 events query per visible lead (capped at .take(20)) plus
 * three small bulk fetches of demoRequests / callbackRequests /
 * formSubmissions. At current volume cheaper than a denormalised counter;
 * revisit once any of those tables crosses a few thousand rows.
 */
export const listWithEngagement = query({
    args: {
        limit: v.optional(v.number()),
        visibility: v.optional(v.union(v.literal("topLevel"), v.literal("all"))),
    },
    handler: async (ctx, args) => {
        // 1. Reuse the same visibility filter as `list` — duplicated inline to
        //    avoid a query-from-query call.
        const limit = args.limit ?? 50;
        const visibility = args.visibility ?? "topLevel";
        let leads;
        if (visibility === "all") {
            leads = await ctx.db
                .query("leads")
                .withIndex("by_createdAt")
                .order("desc")
                .take(limit);
        }
        else {
            const sample = await ctx.db
                .query("leads")
                .withIndex("by_createdAt")
                .order("desc")
                .take(Math.max(limit * 3, 200));
            leads = sample
                .filter((l) => !l.sources.includes("api_outbound") || l.firstEngagedAt != null)
                .slice(0, limit);
        }
        const leadIdSet = new Set(leads.map((l) => l._id));
        // 2. Bulk-fetch the smaller signal tables, group by leadId. These are
        //    "did this lead ever do X" lookups — counts are bounded by table
        //    size, not by leads.length.
        const [demoRows, callbackRows, formRows] = await Promise.all([
            ctx.db.query("demoRequests").take(2000),
            ctx.db.query("callbackRequests").take(2000),
            ctx.db.query("formSubmissions").take(5000),
        ]);
        const demoLeadIds = new Set();
        for (const r of demoRows) {
            if (leadIdSet.has(r.leadId))
                demoLeadIds.add(r.leadId);
        }
        const callbackLeadIds = new Set();
        for (const r of callbackRows) {
            if (leadIdSet.has(r.leadId))
                callbackLeadIds.add(r.leadId);
        }
        const formCountByLead = new Map();
        for (const r of formRows) {
            if (!r.leadId)
                continue;
            if (!leadIdSet.has(r.leadId))
                continue;
            formCountByLead.set(r.leadId, (formCountByLead.get(r.leadId) ?? 0) + 1);
        }
        // 3. Per-lead events lookup + report-URL resolution.
        const reportPathRe = /^\/report\/([a-z0-9]+)/i;
        const eventsPerLead = await Promise.all(leads.map(async (lead) => {
            const events = await ctx.db
                .query("events")
                .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
                .order("desc")
                .take(20);
            return { leadId: lead._id, events };
        }));
        const reportIdSet = new Set();
        for (const { events } of eventsPerLead) {
            for (const e of events) {
                const props = (e.properties ?? {});
                if (typeof props.url === "string" && props.url.length > 0)
                    continue;
                const m = e.path.match(reportPathRe);
                if (m)
                    reportIdSet.add(m[1]);
            }
        }
        const reportUrlById = {};
        await Promise.all(Array.from(reportIdSet).map(async (id) => {
            try {
                const r = await ctx.db.get(id);
                if (r)
                    reportUrlById[id] = r.url;
            }
            catch {
                // Bad id — skip.
            }
        }));
        function enrich(e) {
            const props = (e.properties ?? {});
            if (typeof props.url === "string" && props.url.length > 0)
                return e;
            const m = e.path.match(reportPathRe);
            if (!m)
                return e;
            const url = reportUrlById[m[1]];
            if (!url)
                return e;
            return { ...e, properties: { ...props, url, reportId: m[1] } };
        }
        // 4. Build the side maps.
        const latestEventByLeadId = {};
        const engagementByLeadId = {};
        for (const { leadId, events } of eventsPerLead) {
            const enriched = events.map(enrich);
            const last = enriched[0] ?? null;
            latestEventByLeadId[leadId] = last;
            const viewedReportCount = events.filter((e) => e.type === "outbound_report_viewed").length;
            let maxScrollDepth = 0;
            for (const e of events) {
                if (e.type !== "scroll_depth")
                    continue;
                const depth = e.properties?.depth;
                if (typeof depth === "number" && depth > maxScrollDepth) {
                    maxScrollDepth = depth;
                }
            }
            engagementByLeadId[leadId] = {
                eventCount: events.length,
                viewedReportCount,
                maxScrollDepth,
                formSubmissionCount: formCountByLead.get(leadId) ?? 0,
                hasDemoRequest: demoLeadIds.has(leadId),
                hasCallbackRequest: callbackLeadIds.has(leadId),
                lastActivityAt: last?.timestamp ?? null,
            };
        }
        return { leads, latestEventByLeadId, engagementByLeadId };
    },
});
/**
 * Public wrapper for upsertLead — used by the Next.js API route
 * via ConvexHttpClient (which can't call internal mutations).
 */
export const upsertLeadPublic = mutation({
    args: {
        email: v.string(),
        firstName: v.optional(v.string()),
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        website: v.optional(v.string()),
        source: v.string(),
        anonymousId: v.optional(v.string()),
        signalScore: v.optional(v.number()),
        signalUrl: v.optional(v.string()),
        signalCustomer: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await ctx.runMutation(internal.leads.upsertLead, args);
    },
});
/**
 * Upsert a lead from an outbound API call.
 * On a new row: stamps leadType: "outbound" with no consentedAt.
 * On an existing row: never changes leadType. Adds the API source if missing.
 * Returns the lead ID.
 */
export const upsertOutboundLead = internalMutation({
    args: {
        email: v.string(),
        firstName: v.optional(v.string()),
        phone: v.optional(v.string()),
        website: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const email = args.email.toLowerCase();
        const existing = await getLeadByEmail(ctx, email);
        const SOURCE = "api_outbound";
        if (existing) {
            const updates = { lastSeenAt: now };
            if (args.firstName && !existing.firstName) {
                updates.firstName = args.firstName;
            }
            if (args.phone && !existing.phone) {
                updates.phone = args.phone;
            }
            if (args.website && !existing.website) {
                updates.website = args.website;
            }
            if (!existing.sources.includes(SOURCE)) {
                updates.sources = [...existing.sources, SOURCE];
            }
            // Intentionally do NOT touch leadType — never demote inbound to outbound.
            await ctx.db.patch(existing._id, updates);
            return existing._id;
        }
        return await ctx.db.insert("leads", {
            email,
            firstName: args.firstName,
            phone: args.phone,
            website: args.website,
            anonymousIds: [],
            sources: [SOURCE],
            lastSeenAt: now,
            createdAt: now,
            leadType: "outbound",
            // consentedAt intentionally undefined — they have not consented.
        });
    },
});
/**
 * Public wrapper for upsertOutboundLead — used by the API POST route.
 */
export const upsertOutboundLeadPublic = mutation({
    args: {
        email: v.string(),
        firstName: v.optional(v.string()),
        phone: v.optional(v.string()),
        website: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await ctx.runMutation(internal.leads.upsertOutboundLead, args);
    },
});
/**
 * List outbound (API-generated) leads with their most-recent API report
 * joined. Engaged rows sort first, then by createdAt desc.
 *
 * "Outbound" here means `sources.includes("api_outbound")` rather than
 * `leadType === "outbound"`. Many existing prod leads were wrongly promoted
 * to leadType:"inbound" by a buggy `submitSignalScore` call inside the
 * report-generation action; the `api_outbound` source is the retroactively
 * reliable signal.
 *
 * Used by the /dashboard/api-leads page. Filter:
 *   - "all" (default): every API-sourced lead
 *   - "engaged":       firstEngagedAt set
 *   - "pending":       firstEngagedAt not set
 */
export const listOutbound = query({
    args: {
        filter: v.optional(v.union(v.literal("all"), v.literal("engaged"), v.literal("pending"))),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const filter = args.filter ?? "all";
        const limit = args.limit ?? 200;
        // No `array contains` index in Convex. Scan most-recent-first and
        // JS-filter. At current outbound volume this is fine; if it grows past
        // 5_000 we should denormalise a flag onto the row.
        const sample = await ctx.db
            .query("leads")
            .withIndex("by_createdAt")
            .order("desc")
            .take(5000);
        const outbound = sample.filter((l) => l.sources.includes("api_outbound"));
        const narrowed = outbound.filter((l) => {
            if (filter === "engaged")
                return l.firstEngagedAt != null;
            if (filter === "pending")
                return l.firstEngagedAt == null;
            return true;
        });
        narrowed.sort((a, b) => {
            const aEng = a.firstEngagedAt;
            const bEng = b.firstEngagedAt;
            if (aEng != null && bEng != null)
                return bEng - aEng;
            if (aEng != null)
                return -1;
            if (bEng != null)
                return 1;
            return b.createdAt - a.createdAt;
        });
        const sliced = narrowed.slice(0, limit);
        return await Promise.all(sliced.map(async (lead) => {
            const reports = await ctx.db
                .query("signalReports")
                .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
                .order("desc")
                .take(20);
            const apiReports = reports.filter((r) => r.createdViaApiKeyId != null);
            const report = apiReports[0] ?? null;
            let apiKeyName = null;
            if (report?.createdViaApiKeyId) {
                const key = await ctx.db.get(report.createdViaApiKeyId);
                apiKeyName = key?.name ?? null;
            }
            return { lead, report, apiKeyName };
        }));
    },
});
/** Count of outbound leads in the system (engaged + unengaged).
 *
 * "Outbound" = `sources.includes("api_outbound")`. See the explanation on
 * `listOutbound` for why we don't trust `leadType` here.
 */
export const countOutbound = query({
    args: {},
    handler: async (ctx) => {
        const rows = await ctx.db.query("leads").take(5000);
        return rows.filter((l) => l.sources.includes("api_outbound")).length;
    },
});
/**
 * Admin-only: mark an outbound lead as engaged when we know (from Vercel
 * logs, Resend dashboard, or direct customer contact) that they clicked
 * their report before engagement tracking shipped.
 *
 * Stamps firstEngagedAt/lastEngagedAt/engagementCount on the lead and
 * — if they have a latest API report — firstViewedAt/viewCount on that
 * report. Emits a synthetic `outbound_report_viewed` event so the
 * engagement surfaces in Recent Activity. The event's `source` property
 * records "manual_admin" so it can be distinguished from real click-throughs.
 *
 * Returns the number of fields changed (0 if the lead was already engaged
 * or has no API report).
 */
export const markEngaged = mutation({
    args: { leadId: v.id("leads") },
    handler: async (ctx, args) => {
        const lead = await ctx.db.get(args.leadId);
        if (!lead)
            return { ok: false, alreadyEngaged: false };
        const alreadyEngaged = lead.firstEngagedAt != null;
        const now = Date.now();
        // Find the lead's most recent API-created report (if any).
        const reports = await ctx.db
            .query("signalReports")
            .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
            .order("desc")
            .take(20);
        const apiReport = reports.find((r) => r.createdViaApiKeyId != null) ?? null;
        if (apiReport) {
            const nextViewCount = (apiReport.viewCount ?? 0) + 1;
            await ctx.db.patch(apiReport._id, {
                firstViewedAt: apiReport.firstViewedAt ?? now,
                viewCount: nextViewCount,
            });
            await ctx.db.insert("events", {
                type: "outbound_report_viewed",
                anonymousId: "",
                leadId: lead._id,
                sessionId: "",
                path: `/report/${apiReport._id}`,
                properties: {
                    reportId: apiReport._id,
                    viewCount: nextViewCount,
                    url: apiReport.url,
                    email: lead.email,
                    firstName: lead.firstName ?? null,
                    source: "manual_admin",
                },
                timestamp: now,
            });
        }
        await ctx.db.patch(lead._id, {
            firstEngagedAt: lead.firstEngagedAt ?? now,
            lastEngagedAt: now,
            engagementCount: (lead.engagementCount ?? 0) + 1,
        });
        return { ok: true, alreadyEngaged };
    },
});
