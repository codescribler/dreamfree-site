import { ROLES, ROLE_LABELS } from "./roles";
const SYSTEM_HOUSE_RULES = `You write JSON only. Output exactly this shape:
{
  "subject": string,
  "bodyHtml": string,         // simple HTML, paragraphs as <p>, no inline styles
  "bodyText": string,         // plain-text equivalent, line breaks preserved
  "loopsOpened": [{ "id": string, "description": string }],
  "loopsClosed": [string],    // ids of previously open loops you closed in this email
  "reportFindingsUsed": [string]  // short labels: "grunt-test pass", "weak CTA copy", etc.
}

House rules — non-negotiable:
- No manufactured drama, vague specifics, guru voice, transformation porn, or fake reluctance.
- Personalisation must do argumentative work, not decorative work. If you can remove a report-derived line and the argument doesn't weaken, leave it out.
- Read it aloud. Would Daniel say it that way to a friend at the pub? If not, cut it.
- bodyHtml and bodyText must say the same thing. Don't include CSS or <style> tags.
- Loop IDs should be short kebab-case strings ("consultant-line", "almost-didnt-send"). Reuse existing IDs from the ledger when closing.`;
export function buildGenerationSystemPrompt(voiceSpec) {
    return `${voiceSpec}\n\n${SYSTEM_HOUSE_RULES}`;
}
export function buildGenerationUserPrompt(args) {
    const roleIndex = ROLES.indexOf(args.role);
    const orderLabel = `${roleIndex + 1} of ${ROLES.length}`;
    const openLoops = args.loopLedger.filter((l) => !l.closedInRole);
    const openLoopsBlock = openLoops.length === 0
        ? "(none)"
        : openLoops
            .map((l) => `- [${l.id}] opened in ${l.openedInRole}: ${l.description}`)
            .join("\n");
    const priorBlock = args.priorDrafts.length === 0
        ? "(this is the first email)"
        : args.priorDrafts
            .map((d) => `===\nROLE: ${d.role}\nSUBJECT: ${d.subject}\nBODY:\n${d.bodyText}\n===`)
            .join("\n\n");
    return `You are writing email ${orderLabel} in a sequence.

Recipient: ${args.recipientFirstName}, ${args.recipientEmail}
Their site: ${args.report.url}
Their ideal customer (their words): ${args.report.customerDescription}

Their full Signal Report:
${JSON.stringify(args.report, null, 2)}

Your role for this email: ${args.role} (${ROLE_LABELS[args.role]})

Brief:
- Purpose: ${args.brief.purpose}
- Required beats: ${args.brief.requiredBeats}
- Tone: ${args.brief.tone}
- Length: ${args.brief.lengthGuide}

Worked example (stylistic anchor only — do not copy):
${args.brief.workedExample}

Loops currently open across this sequence (each must close by the offer; at least one must remain active when this email ends):
${openLoopsBlock}

Loops you must close in this email: ${args.brief.loopsToClose}
Loops you may open in this email: ${args.brief.loopsToOpen}

Previous emails in this sequence (in order, earliest first):
${priorBlock}

Write the email. Use the report findings where they deepen the argument; leave them out where they don't.`;
}
