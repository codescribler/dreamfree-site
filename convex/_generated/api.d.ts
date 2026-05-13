/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiModelPricing from "../aiModelPricing.js";
import type * as aiModelReplay from "../aiModelReplay.js";
import type * as aiModels from "../aiModels.js";
import type * as apiKeys from "../apiKeys.js";
import type * as callbackRequests from "../callbackRequests.js";
import type * as contentPlans from "../contentPlans.js";
import type * as crons from "../crons.js";
import type * as demoRequests from "../demoRequests.js";
import type * as emailCampaigns from "../emailCampaigns.js";
import type * as emailCampaignsAction from "../emailCampaignsAction.js";
import type * as emails from "../emails.js";
import type * as events from "../events.js";
import type * as formSubmissions from "../formSubmissions.js";
import type * as leads from "../leads.js";
import type * as loginTokens from "../loginTokens.js";
import type * as migrations from "../migrations.js";
import type * as missionControl from "../missionControl.js";
import type * as signalInsights from "../signalInsights.js";
import type * as signalInsightsAction from "../signalInsightsAction.js";
import type * as signalReports from "../signalReports.js";
import type * as signalReportsAction from "../signalReportsAction.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiModelPricing: typeof aiModelPricing;
  aiModelReplay: typeof aiModelReplay;
  aiModels: typeof aiModels;
  apiKeys: typeof apiKeys;
  callbackRequests: typeof callbackRequests;
  contentPlans: typeof contentPlans;
  crons: typeof crons;
  demoRequests: typeof demoRequests;
  emailCampaigns: typeof emailCampaigns;
  emailCampaignsAction: typeof emailCampaignsAction;
  emails: typeof emails;
  events: typeof events;
  formSubmissions: typeof formSubmissions;
  leads: typeof leads;
  loginTokens: typeof loginTokens;
  migrations: typeof migrations;
  missionControl: typeof missionControl;
  signalInsights: typeof signalInsights;
  signalInsightsAction: typeof signalInsightsAction;
  signalReports: typeof signalReports;
  signalReportsAction: typeof signalReportsAction;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
