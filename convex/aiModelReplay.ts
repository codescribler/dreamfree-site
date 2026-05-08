// convex/aiModelReplay.ts
import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  callOpenRouterMetered,
  MeteredCallError,
  type MeteredCallResult,
} from "../lib/ai/openrouter-metered";
import { estimateCostGbp } from "../lib/ai/cost";
import {
  buildSignalPrompt,
  calculateOverallScore,
} from "../lib/signal-prompt";
import { stripHtml } from "../lib/html-stripper";
import {
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsUserPrompt,
  parseInsightResponse,
  type SectionKey,
} from "../lib/insights-prompt";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  type ReportForPrompt,
  type LoopLedgerEntry,
  type PriorDraft,
} from "../lib/email-campaigns/generation-prompt";
import {
  validateGenerationResult,
  GenerationResultError,
} from "../lib/email-campaigns/generation-result";
import { type Role } from "../lib/email-campaigns/roles";
import { parseLlmJson } from "../lib/email-campaigns/openrouter";
import {
  CONTENT_IDEAS_SYSTEM_PROMPT,
  buildContentIdeasUserPrompt,
} from "../lib/ai/prompts/content-ideas";

interface BuiltPrompt {
  system: string;
  user: string;
  temperature: number;
  responseFormat?: "json_object";
  /** Returns null on success, error msg on failure. */
  validate: (raw: string) => string | null;
}

// ---------- internal queries to load source records --------------------------

export const getSignalReportForReplay = internalQuery({
  args: { reportId: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId as never);
    if (!report) return null;
    const r = report as { url: string; customerDescription: string };
    return { url: r.url, customerDescription: r.customerDescription };
  },
});

export const getInsightForReplay = internalQuery({
  args: { insightId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ section: string; reports: unknown[] } | null> => {
    const insight = await ctx.db.get(args.insightId as never);
    if (!insight) return null;
    const data = await ctx.runQuery(
      internal.signalInsights.getReportsForInsight,
      { insightId: args.insightId as never },
    );
    if (!data) return null;
    return { section: data.section, reports: data.reports };
  },
});

export const getDraftForReplay = internalQuery({
  args: { draftId: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId as never);
    if (!draft) return null;
    const draftDoc = draft as {
      enrollmentId: string;
      role: string;
      order: number;
      briefVersionUsed: number;
      voiceVersionUsed: number;
    };
    const enrollment = await ctx.db.get(draftDoc.enrollmentId as never);
    if (!enrollment) return null;
    const enrollmentDoc = enrollment as unknown as {
      leadId: string;
      reportId: string;
      voiceSpecId: string;
      loopLedger: unknown[];
    };
    const lead = await ctx.db.get(enrollmentDoc.leadId as never);
    const report = await ctx.db.get(enrollmentDoc.reportId as never);
    const voiceSpec = await ctx.db.get(enrollmentDoc.voiceSpecId as never);
    if (!lead || !report || !voiceSpec) return null;

    const briefs = await ctx.db
      .query("emailRoleBriefs")
      .filter((q) =>
        q.and(
          q.eq(q.field("role"), draftDoc.role),
          q.eq(q.field("version"), draftDoc.briefVersionUsed),
        ),
      )
      .collect();
    const brief = briefs[0];
    if (!brief) return null;

    const allDrafts = await ctx.db
      .query("emailDrafts")
      .filter((q) => q.eq(q.field("enrollmentId"), draftDoc.enrollmentId))
      .collect();
    const priorDrafts = allDrafts
      .filter((d) => (d as { order: number }).order < draftDoc.order)
      .sort(
        (a, b) =>
          (a as { order: number }).order - (b as { order: number }).order,
      )
      .map((d) => ({
        role: (d as { role: string }).role,
        subject: (d as { subject: string }).subject,
        bodyText: (d as { bodyText: string }).bodyText,
      }));

    const r = report as {
      url: string;
      customerDescription: string;
      overallScore: number;
      gruntTest: unknown;
      elements: unknown;
      quickWin: string;
      strengths: string[];
      fullSummary: string;
    };
    const leadDoc = lead as {
      firstName?: string;
      name?: string;
      email: string;
    };
    const voiceSpecDoc = voiceSpec as { body: string; version: number };

    return {
      draft: { role: draftDoc.role, order: draftDoc.order },
      enrollment: { loopLedger: enrollmentDoc.loopLedger },
      lead: leadDoc,
      voiceSpec: voiceSpecDoc,
      brief: {
        purpose: brief.purpose,
        requiredBeats: brief.requiredBeats,
        loopsToOpen: brief.loopsToOpen,
        loopsToClose: brief.loopsToClose,
        tone: brief.tone,
        lengthGuide: brief.lengthGuide,
        workedExample: brief.workedExample,
      },
      priorDrafts,
      reportForPrompt: {
        url: r.url,
        customerDescription: r.customerDescription,
        overallScore: r.overallScore,
        gruntTest: r.gruntTest,
        elements: r.elements,
        quickWin: r.quickWin,
        strengths: r.strengths,
        fullSummary: r.fullSummary,
      },
    };
  },
});

export const getContentPlanForReplay = internalQuery({
  args: { planId: v.string() },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId as never);
    if (!plan) return null;
    return (plan as { input: unknown }).input;
  },
});

// ---------- typed wrappers around internal queries ---------------------------
// These wrappers break the circular-inference cycle by giving each call
// an explicit return type that TypeScript can resolve without recursion.

type SignalReportData = { url: string; customerDescription: string } | null;
type InsightData = { section: string; reports: unknown[] } | null;
type DraftData = {
  draft: { role: string; order: number };
  enrollment: { loopLedger: unknown[] };
  lead: { firstName?: string; name?: string; email: string };
  voiceSpec: { body: string; version: number };
  brief: {
    purpose: string;
    requiredBeats: string;
    loopsToOpen: string;
    loopsToClose: string;
    tone: string;
    lengthGuide: string;
    workedExample: string;
  };
  priorDrafts: { role: string; subject: string; bodyText: string }[];
  reportForPrompt: ReportForPrompt;
} | null;
type ContentInput = {
  name: string;
  email: string;
  businessDescription: string;
  goal: string;
  channelsTried: string[];
  frustration: string;
  timePerWeek: string;
  website?: string;
} | null;

async function fetchSignalReportData(
  ctx: ActionCtx,
  recordId: string,
): Promise<SignalReportData> {
  return (await ctx.runQuery(
    internal.aiModelReplay.getSignalReportForReplay,
    { reportId: recordId },
  )) as SignalReportData;
}

async function fetchInsightData(
  ctx: ActionCtx,
  recordId: string,
): Promise<InsightData> {
  return (await ctx.runQuery(
    internal.aiModelReplay.getInsightForReplay,
    { insightId: recordId },
  )) as InsightData;
}

async function fetchDraftData(
  ctx: ActionCtx,
  recordId: string,
): Promise<DraftData> {
  return (await ctx.runQuery(
    internal.aiModelReplay.getDraftForReplay,
    { draftId: recordId },
  )) as DraftData;
}

async function fetchContentInput(
  ctx: ActionCtx,
  recordId: string,
): Promise<ContentInput> {
  return (await ctx.runQuery(
    internal.aiModelReplay.getContentPlanForReplay,
    { planId: recordId },
  )) as ContentInput;
}

// ---------- prompt building --------------------------------------------------

async function buildPromptForRecord(
  ctx: ActionCtx,
  useCase: string,
  recordId: string,
): Promise<BuiltPrompt> {
  if (useCase === "signal_reports") {
    const report = await fetchSignalReportData(ctx, recordId);
    if (!report) throw new Error(`Signal report ${recordId} not found`);

    // Re-fetch + strip HTML (replay uses LIVE current site content; original input HTML is not stored).
    const fetchRes = await fetch(report.url, {
      headers: { "User-Agent": "Mozilla/5.0 Dreamfree-Replay" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!fetchRes.ok) {
      throw new Error(
        `Failed to fetch ${report.url}: HTTP ${fetchRes.status}`,
      );
    }
    const rawHtml = await fetchRes.text();
    const stripped = stripHtml(rawHtml);

    const { system, user } = buildSignalPrompt(
      stripped,
      report.customerDescription,
    );
    return {
      system,
      user,
      temperature: 0.3,
      responseFormat: "json_object",
      validate: (raw) => {
        try {
          const parsed = JSON.parse(
            raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim(),
          );
          calculateOverallScore(parsed.elements);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
    };
  }

  if (useCase === "signal_insights") {
    const data = await fetchInsightData(ctx, recordId);
    if (!data) throw new Error(`Signal insight ${recordId} not found`);
    const userPrompt = buildInsightsUserPrompt(
      data.section as SectionKey,
      data.reports as never,
    );
    return {
      system: INSIGHTS_SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.5,
      responseFormat: "json_object",
      validate: (raw) => {
        try {
          parseInsightResponse(raw);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
    };
  }

  if (useCase === "email_drafts") {
    const data = await fetchDraftData(ctx, recordId);
    if (!data) throw new Error(`Email draft ${recordId} not found`);
    const {
      draft,
      enrollment,
      lead,
      voiceSpec,
      brief,
      priorDrafts,
      reportForPrompt,
    } = data;
    const firstNameCandidate =
      lead.firstName?.trim() || lead.name?.split(" ")[0] || "there";
    const userPrompt = buildGenerationUserPrompt({
      voiceSpec: voiceSpec.body,
      recipientFirstName: firstNameCandidate,
      recipientEmail: lead.email,
      report: reportForPrompt,
      role: draft.role as Role,
      brief: {
        purpose: brief.purpose,
        requiredBeats: brief.requiredBeats,
        loopsToOpen: brief.loopsToOpen,
        loopsToClose: brief.loopsToClose,
        tone: brief.tone,
        lengthGuide: brief.lengthGuide,
        workedExample: brief.workedExample,
      },
      priorDrafts: priorDrafts as PriorDraft[],
      loopLedger: enrollment.loopLedger as LoopLedgerEntry[],
    });
    return {
      system: buildGenerationSystemPrompt(voiceSpec.body),
      user: userPrompt,
      temperature: 0.7,
      responseFormat: "json_object",
      validate: (raw) => {
        try {
          validateGenerationResult(parseLlmJson(raw));
          return null;
        } catch (e) {
          return e instanceof GenerationResultError ? e.message : String(e);
        }
      },
    };
  }

  if (useCase === "content_ideas") {
    const input = await fetchContentInput(ctx, recordId);
    if (!input) throw new Error(`Content plan ${recordId} not found`);
    const userPrompt = buildContentIdeasUserPrompt({
      name: input.name,
      email: input.email,
      businessDescription: input.businessDescription,
      goal: input.goal,
      channelsTried: input.channelsTried,
      frustration: input.frustration,
      timePerWeek: input.timePerWeek,
      website: input.website,
    });
    return {
      system: CONTENT_IDEAS_SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.7,
      validate: (raw) => {
        const trimmed = raw.trim();
        if (trimmed.length === 0) return "empty response";
        return null;
      },
    };
  }

  throw new Error(`Unsupported use-case for replay: ${useCase}`);
}

// ---------- model call -------------------------------------------------------

async function runOneCall(
  prompt: BuiltPrompt,
  model: string,
): Promise<{
  model: string;
  output: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  rawResponse: unknown;
  valid: boolean;
  validationError?: string;
}> {
  let result: MeteredCallResult;
  try {
    result = await callOpenRouterMetered({
      model,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      temperature: prompt.temperature,
      responseFormat: prompt.responseFormat,
    });
  } catch (err) {
    if (err instanceof MeteredCallError) {
      return {
        model,
        output: "",
        latencyMs: err.latencyMs,
        rawResponse: err.rawResponse,
        valid: false,
        validationError: err.message,
      };
    }
    throw err;
  }

  const validationError = prompt.validate(result.output);
  return {
    model,
    output: result.output,
    latencyMs: result.latencyMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    rawResponse: result.rawResponse,
    valid: validationError === null,
    validationError: validationError ?? undefined,
  };
}

type EnrichedResult = {
  model: string;
  output: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  rawResponse: unknown;
  valid: boolean;
  validationError?: string;
  costGbp?: number;
};

// ---------- public action ----------------------------------------------------

export const runReplay = action({
  args: {
    useCase: v.string(),
    recordId: v.string(),
    candidateModel: v.string(),
    compareModel: v.optional(v.string()),
    runBy: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ replayId: string; results: EnrichedResult[] }> => {
    const prompt = await buildPromptForRecord(ctx, args.useCase, args.recordId);

    const calls = [runOneCall(prompt, args.candidateModel)];
    if (args.compareModel && args.compareModel !== args.candidateModel) {
      calls.push(runOneCall(prompt, args.compareModel));
    }
    const calledResults = await Promise.all(calls);

    const enriched: EnrichedResult[] = await Promise.all(
      calledResults.map(async (r): Promise<EnrichedResult> => {
        const pricing = (await ctx.runQuery(
          internal.aiModelPricing.getPricing,
          { model: r.model },
        )) as { promptUsdPerMillion: number; completionUsdPerMillion: number } | null;
        return {
          ...r,
          costGbp: estimateCostGbp(
            r.promptTokens,
            r.completionTokens,
            pricing,
          ),
        };
      }),
    );

    const replayId = (await ctx.runMutation(
      internal.aiModelReplay.insertReplay,
      {
        useCase: args.useCase,
        recordId: args.recordId,
        candidateModel: args.candidateModel,
        compareModel: args.compareModel,
        results: enriched,
        runBy: args.runBy,
        runAt: Date.now(),
      },
    )) as string;

    return { replayId, results: enriched };
  },
});

export const insertReplay = internalMutation({
  args: {
    useCase: v.string(),
    recordId: v.string(),
    candidateModel: v.string(),
    compareModel: v.optional(v.string()),
    results: v.array(v.any()),
    runBy: v.string(),
    runAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("aiModelReplays", {
      useCase: args.useCase,
      recordId: args.recordId,
      candidateModel: args.candidateModel,
      compareModel: args.compareModel,
      results: args.results,
      runBy: args.runBy,
      runAt: args.runAt,
    });
  },
});

export const listRecentReplays = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiModelReplays")
      .withIndex("by_runAt")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const getReplay = query({
  args: { replayId: v.id("aiModelReplays") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.replayId);
  },
});

export const deleteOldReplays = internalMutation({
  args: { olderThanMs: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanMs;
    const old = await ctx.db
      .query("aiModelReplays")
      .withIndex("by_runAt", (q) => q.lt("runAt", cutoff))
      .collect();
    for (const row of old) {
      await ctx.db.delete(row._id);
    }
    console.log(
      `deleteOldReplays: removed ${old.length} replays older than ${new Date(cutoff).toISOString()}`,
    );
  },
});

export const cleanupOldReplays = internalAction({
  args: {},
  handler: async (ctx) => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    await ctx.runMutation(internal.aiModelReplay.deleteOldReplays, {
      olderThanMs: THIRTY_DAYS_MS,
    });
  },
});
