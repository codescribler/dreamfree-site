import type { Role } from "./roles";
import { ROLES } from "./roles";

export interface DraftForVerifier {
  role: Role;
  order: number;
  subject: string;
  bodyText: string;
  loopsOpenedHere: string[];
  loopsClosedHere: string[];
  reportFindingsUsed: string[];
}

export interface VerifierPromptArgs {
  voiceSpec: string;
  drafts: DraftForVerifier[];
  reportSummary: string;
}

export const VERIFIER_SYSTEM_PROMPT = `You audit a 7-email soap-opera sales sequence for four problems:

1. **Voice** — Has the writing drifted toward generic LLM register? Does it match the voice spec?
2. **Loops** — Does every loop opened across the sequence close by the offer? Is at least one loop active at every point in the sequence (i.e. when each non-final email ends, is there an open loop pulling the reader to the next email)?
3. **Cheese** — Does any draft contain the five cheese markers? Manufactured drama; vague specifics; guru voice; transformation porn; fake reluctance.
4. **Factual** — Does any draft contradict or invent something inconsistent with the report findings?

You return JSON only:
{
  "voice":   [{ "role": "<role>", "note": "..." }],
  "loops":   [{ "role": "<role>", "note": "..." }],
  "cheese":  [{ "role": "<role>", "note": "..." }],
  "factual": [{ "role": "<role>", "note": "..." }]
}

If a category is clean, return an empty array for it. Notes should be one sentence each, pointing to the specific issue. Use "sequence" as the role for whole-sequence issues (e.g. an open loop that never closes).`;

export function buildVerifierUserPrompt(args: VerifierPromptArgs): string {
  const draftsBlock = args.drafts
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((d) => {
      const findings =
        d.reportFindingsUsed.length > 0
          ? d.reportFindingsUsed.join(", ")
          : "(none cited)";
      const opens =
        d.loopsOpenedHere.length > 0
          ? d.loopsOpenedHere.join(", ")
          : "(none)";
      const closes =
        d.loopsClosedHere.length > 0
          ? d.loopsClosedHere.join(", ")
          : "(none)";
      return `=== Email ${d.order + 1}/${ROLES.length} — ${d.role} ===
SUBJECT: ${d.subject}
LOOPS OPENED HERE: ${opens}
LOOPS CLOSED HERE: ${closes}
REPORT FINDINGS CITED: ${findings}
BODY:
${d.bodyText}`;
    })
    .join("\n\n");

  return `Voice spec to check against:
---
${args.voiceSpec}
---

Report summary (factual ground truth):
---
${args.reportSummary}
---

The 7 emails in order:
${draftsBlock}`;
}
