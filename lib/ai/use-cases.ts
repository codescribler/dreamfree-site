export const USE_CASES = [
  "default",
  "signal_reports",
  "signal_insights",
  "email_drafts",
  "content_ideas",
] as const;

export type UseCase = (typeof USE_CASES)[number];

export const REPLAYABLE_USE_CASES: UseCase[] = [
  "signal_reports",
  "signal_insights",
  "email_drafts",
  "content_ideas",
];

export const USE_CASE_LABELS: Record<UseCase, string> = {
  default: "Default (used when use-case isn't configured)",
  signal_reports: "Signal Reports",
  signal_insights: "Signal Insights",
  email_drafts: "Email Drafts",
  content_ideas: "Content Ideas",
};

export function isUseCase(value: string): value is UseCase {
  return (USE_CASES as readonly string[]).includes(value);
}
