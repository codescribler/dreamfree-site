/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as callbackRequests from "../callbackRequests.js";
import type * as contentPlans from "../contentPlans.js";
import type * as demoRequests from "../demoRequests.js";
import type * as emails from "../emails.js";
import type * as events from "../events.js";
import type * as formSubmissions from "../formSubmissions.js";
import type * as leads from "../leads.js";
import type * as signalReports from "../signalReports.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  callbackRequests: typeof callbackRequests;
  contentPlans: typeof contentPlans;
  demoRequests: typeof demoRequests;
  emails: typeof emails;
  events: typeof events;
  formSubmissions: typeof formSubmissions;
  leads: typeof leads;
  signalReports: typeof signalReports;
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
