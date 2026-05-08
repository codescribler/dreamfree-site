// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "refresh openrouter pricing",
  { hourUTC: 3, minuteUTC: 0 },
  internal.aiModelPricing.refreshPricing,
);

export default crons;
