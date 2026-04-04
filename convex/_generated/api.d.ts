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
import type * as emails from "../emails.js";
import type * as events from "../events.js";
import type * as formSubmissions from "../formSubmissions.js";
import type * as leads from "../leads.js";
import type * as signalReports from "../signalReports.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  callbackRequests: typeof callbackRequests;
  emails: typeof emails;
  events: typeof events;
  formSubmissions: typeof formSubmissions;
  leads: typeof leads;
  signalReports: typeof signalReports;
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
