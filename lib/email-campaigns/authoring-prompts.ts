import {
  ROLES,
  ROLE_LABELS,
  VOICE_SPEC_STUB_MARKER,
  type Role,
} from "./roles";

const FRAMEWORK_INTRO = `You're helping Daniel Whittaker — founder of Dreamfree, a UK web agency in Hertfordshire — author the building blocks of an email sequence.

Background context you must understand:

- Dreamfree builds subscription-based websites for UK trades, sports, healthcare, and local businesses. The differentiator is the "demo-first" approach: build a working demo of the prospect's site BEFORE the first sales email.
- Daniel runs a tool called the Signal Score at dreamfree.co.uk. Visitors enter their URL, get a free messaging audit scored 0-100 across 7 elements (the StoryBrand SB7 framework). The Signal Method is Dreamfree's framing of that audit.
- When a visitor finishes a Signal Report, they get one transactional email unlocking the report. Then they enter a 7-email "soap opera sequence" — an automated, personalised email arc that converts the lead into a client.
- Each email in the sequence is rewritten by an LLM for the specific recipient using their Signal Report findings. But the LLM only writes well if the *building blocks* are right: the voice spec it works against, and the worked examples per role that anchor each email's tone.
- That's what you're helping Daniel author today.

The Soap Opera Sequence — non-negotiable mechanics:

The sequence is one continuous story broken across emails. Each email's job is to make the *next* one get opened. The engine is OPEN LOOPS — deliberately unresolved tensions that the reader's brain refuses to let go of (Zeigarnik effect). A loop has three components: (1) a question the reader now wants answered, (2) stakes that make the answer matter, (3) a specific moment when the answer arrives.

Two non-negotiable rules:
1. CLOSURE DISCIPLINE — every loop opened must close. If email 2 teases "what the consultant said", email 3 must deliver that line.
2. AT EVERY POINT IN THE SEQUENCE, AT LEAST ONE LOOP MUST BE ACTIVE. Never let a reader finish an email with nothing pulling them to the next one.

The 7 roles in order:
1. Orientation — who Daniel is, what's coming, why they should keep opening
2. Backstory & stakes — where Daniel was before, what was at risk
3. The wall — the moment things had to change; the crisis point
4. The epiphany — the shift in thinking; the new lens
5. Application & proof — how the new way actually works, with evidence
6. Hidden benefits — second-order benefits each quietly answering an objection
7. The offer — the ask, why now, the CTA`;

const CHEESE_RULES = `Cheese rules — non-negotiable. The cheesy soap opera sequence has a smell. Avoid these markers:

1. MANUFACTURED DRAMA. "There I was, on the floor of my apartment, tears streaming down my face..." Hallmark voiceover energy. Cut it.
2. VAGUE SPECIFICS. "I made one small change and EVERYTHING shifted." What change? The vagueness is the tell.
3. GURU VOICE. "Listen, friend, I'm going to be real with you for a second." Real people don't announce realness.
4. TRANSFORMATION PORN. $0 to $10k/month in 30 days while standing on a beach. BS detector trips immediately.
5. FAKE RELUCTANCE. "I almost didn't share this... but I knew I had to." Nobody believes this anymore.

Antidotes: specificity, restraint, conversational register, proportion, earned vulnerability.

The "read it aloud" test: would Daniel say it that way to a friend at the pub? If not, cut it.`;

const ROLE_DETAILS: Record<
  Role,
  {
    purpose: string;
    requiredBeats: string;
    loopsToOpen: string;
    loopsToClose: string;
    tone: string;
    lengthGuide: string;
    probingQuestions: string;
  }
> = {
  orientation: {
    purpose:
      "Introduce Daniel; surface the most striking finding from the recipient's report; tease one specific weird detail that pulls them into email 2.",
    requiredBeats:
      "Greet by first name. Reference the URL audited. Surface ONE concrete finding (often not the worst score — the most interesting one). Tease a specific weird detail about Daniel's story or the upcoming sequence as an open loop. Promise the next email.",
    loopsToOpen:
      "One narrative loop pointing at the backstory email — a specific, weird, concrete detail (e.g. 'why I closed my laptop and walked out for two hours').",
    loopsToClose: "None — first email.",
    tone:
      "Warm but not over-friendly. Direct. Reads like Daniel sat down after looking at their site and wrote them.",
    lengthGuide: "120–180 words.",
    probingQuestions: `Probing questions to ask Daniel:
- When you've sat down to write a personal email to a prospect after looking at their site, how do you typically open it? What words do you use?
- What's the ONE finding from a typical Signal Report that surprises business owners most? (Not the worst score — the unexpected one.)
- What's one specific, weird, concrete detail from your own story that would make someone curious? (e.g. "the consultant told me X and I closed my laptop and walked out for two hours" — but yours, real, specific.)
- How do you sign off in personal emails? "— Daniel" or something else?`,
  },
  backstory: {
    purpose:
      "Establish where Daniel was before — humanise him so the reader cares. Open the loop that closes in the wall email.",
    requiredBeats:
      "Brief Royal Marine context (background, not theme). What Daniel was doing before web strategy. What was at risk for him personally.",
    loopsToOpen: "Tease the moment things had to change ('the wall').",
    loopsToClose:
      "Close the orientation loop's specific detail (deliver the consultant line, the laptop moment, etc.).",
    tone: "Reflective, not dramatic. Specific not vague.",
    lengthGuide: "150–220 words.",
    probingQuestions: `Probing questions to ask Daniel:
- What's the simplest, most honest version of "what I was doing before web strategy"? (Not a polished founder origin story — the real version.)
- What was personally at stake? (Mortgage? Reputation? Sense of self? Something else?)
- The Royal Marine background — what's one detail from that life that genuinely shaped how you think about web work today? (Background, not theme. One detail. Not "discipline and grit".)
- What's a specific moment of doubt or near-quit you remember from that period?`,
  },
  wall: {
    purpose:
      "The crisis point. The moment Daniel realised the old approach wasn't working.",
    requiredBeats:
      "A specific incident or realisation. What broke. What he saw that he hadn't before. Should mirror the recipient's likely weakness from the report — if their CTA is weak, the wall is when Daniel realised CTAs were the issue.",
    loopsToOpen: "Tease the new lens (epiphany).",
    loopsToClose: "Close the loop opened in the backstory email.",
    tone: "Honest. No transformation porn.",
    lengthGuide: "150–220 words.",
    probingQuestions: `Probing questions to ask Daniel:
- What's the actual moment you realised the old way wasn't working? (Not "I had a realisation" — what was happening that day, who was there, what did you see?)
- What specifically broke? A client conversation? A site that bombed? A pattern you noticed across many?
- What did you see that you hadn't seen before? Be precise about the BEFORE and the AFTER thinking.
- Is there a sentence someone said to you, or that you said out loud to yourself, that captured the moment?`,
  },
  epiphany: {
    purpose:
      "The shift in thinking. The new lens. Name the principle the recipient is violating and reframe it.",
    requiredBeats:
      "The principle (generic — applies to all readers). The recipient's specific violation (from their report — handled at LLM-rewrite time). Why the old way fails and the new way works.",
    loopsToOpen:
      "Tease how the new way actually works in practice (application email).",
    loopsToClose: "Close the loop opened in the wall email.",
    tone: "Confident but not preachy.",
    lengthGuide: "180–250 words.",
    probingQuestions: `Probing questions to ask Daniel:
- What's the principle in plain language — the thing you wish every business owner knew about their website? Avoid jargon and avoid "clear messaging". Be specific to your method.
- Why does the OLD way of thinking about websites fail? (e.g. focus on aesthetics, focus on the business not the customer, etc.)
- Why does the new way work? What's the underlying mechanism?
- What's a one-line version of the principle, the kind you'd say to a stranger at a wedding when they asked what you do?`,
  },
  application: {
    purpose:
      "Show how the new way actually works, with proof. Apply it to the recipient's site.",
    requiredBeats:
      "Concrete mechanism. Evidence (case, before/after, principle in action). At LLM-rewrite time this will rewrite a section of their actual copy — your worked example shows the SHAPE of that.",
    loopsToOpen:
      "Tease a second-order benefit the reader hasn't thought of (hidden benefits email).",
    loopsToClose: "Close the loop opened in the epiphany email.",
    tone: "Practical. Working-out-loud.",
    lengthGuide: "200–280 words.",
    probingQuestions: `Probing questions to ask Daniel:
- Pick one client of yours. What's a specific section of THEIR site you fixed using the Signal Method, and what was the before/after?
- What's a generic version of that fix that applies to most prospects? (Hero section? CTA? Customer-as-hero positioning?)
- If you were rewriting a hero section in real-time as a worked example, what would that look like? Show your reasoning, not just the output.
- What's a measurable result from a real client (conversion lift, leads/month, customer stories) you can quote?`,
  },
  hidden_benefits: {
    purpose:
      "Surface second-order benefits — each quietly answering a likely objection.",
    requiredBeats:
      "Two or three benefits the reader hadn't considered. Each tied to industry context (plumber's hidden benefits look different from a hearing clinic's — handled at LLM-rewrite time). Each benefit pre-empts a different objection.",
    loopsToOpen: "Tease the offer — what comes next, why now.",
    loopsToClose: "Close the loop opened in the application email.",
    tone: "Generous. Like sharing what you've noticed.",
    lengthGuide: "180–250 words.",
    probingQuestions: `Probing questions to ask Daniel:
- What are the three most common objections you hear when a prospect is on the fence? ("I'm too busy", "I can't afford it", "my website is fine", etc.) — be specific.
- For each objection, what's a SECOND-ORDER benefit that quietly defuses it? (Not "here's why you're wrong" — "here's what you didn't know would happen as a side effect of doing this".)
- What's a benefit clients have told you about that surprised even you? (Most prospects haven't thought of it.)
- How would you frame these benefits for a UK trades audience specifically, vs a clinic, vs a sports business?`,
  },
  offer: {
    purpose:
      "Make the ask. Name the gap between where they are (per their report) and where the offer takes them.",
    requiredBeats:
      "Reference the specific gap (LLM rewrites this for the recipient at send time — your worked example shows the shape). The offer (subscription tier most appropriate). Why now. Clear CTA — reply to the email.",
    loopsToOpen: "None — last email.",
    loopsToClose: "Close every remaining open loop.",
    tone: "Direct. No reluctance theatre.",
    lengthGuide: "180–250 words.",
    probingQuestions: `Probing questions to ask Daniel:
- What's the entry-level offer for prospects who came through the Signal Score? (£79/month? £197? Something specific to this funnel?)
- What's the actual reason now matters? (Not invented urgency — real reasons: launch season, your own capacity, market conditions, etc.)
- What's the simplest CTA you'd use? (Reply to the email? Book a call? Visit a page?)
- For prospects who are clearly NOT a fit, what's a graceful "no offer here, but here's something useful" line you'd write?`,
  },
};

function priorRolesBlock(
  currentRole: Role,
  briefsByRole: Record<Role, { workedExample: string }>,
): string {
  const priorRoles = ROLES.slice(0, ROLES.indexOf(currentRole));
  if (priorRoles.length === 0) {
    return "(this is the first email — no prior worked examples yet)";
  }
  const lines: string[] = [];
  for (const role of priorRoles) {
    const example = briefsByRole[role]?.workedExample ?? "";
    const isStub =
      example.trim() === "" ||
      example.includes("[FILL IN") ||
      example.includes("[FILL IN]");
    lines.push(
      `--- ${ROLE_LABELS[role]} (${role}) worked example ---\n${
        isStub
          ? "(NOT YET WRITTEN — flag this to Daniel; he should author the prior roles in order before this one)"
          : example
      }`,
    );
  }
  return lines.join("\n\n");
}

function voiceSpecBlock(voiceSpec: string): string {
  if (voiceSpec.includes(VOICE_SPEC_STUB_MARKER) || voiceSpec.trim() === "") {
    return `(NOT YET WRITTEN — flag this to Daniel; the voice spec is still the stub. He should run the "Voice spec" tab first to author it before any worked examples, otherwise the result will not match his voice.)`;
  }
  return voiceSpec.trim();
}

export function buildVoiceSpecPrompt(): string {
  return `${FRAMEWORK_INTRO}

---

## Today's task: author Daniel's voice spec

The voice spec is a single document. It will be loaded as the SYSTEM PROMPT every time an LLM rewrites an email for a specific recipient. It is the single biggest determinant of whether the resulting emails sound like Daniel or like generic LLM slop.

Your job: help Daniel articulate his voice precisely enough that a different LLM (Gemini 2.5 Flash) can match it.

## Process — follow this exactly

**Step 1 — Ask Daniel for samples.**

Ask: "Paste 3 to 5 paragraphs of writing where you sound like yourself. LinkedIn posts, emails to a friend, articles you've published, anything where you weren't trying too hard. Don't filter — paste the rough stuff alongside the polished. The mix tells me more than the polish."

Wait for his samples. Do not proceed until you have at least 3.

**Step 2 — Read the samples carefully and identify:**

- **Sentence rhythm.** Long/short balance. Does he use fragments? How long are his paragraphs? Does he start sentences with "And" or "But"?
- **Vocabulary patterns.** Concrete vs abstract. Specific words he reaches for. Words he never uses. Domain-specific language vs plain English.
- **What he avoids.** Cliché. Hedging language ("just", "perhaps", "I think maybe"). Jargon. Adverbs.
- **Register.** Formal / conversational / blunt / warm — where on the spectrum and how does it shift across paragraphs?
- **Sentence structures.** Does he favour declarative sentences? Questions? Lists? Em-dashes?

**Step 3 — Draft a voice spec doc** in this exact structure:

\`\`\`
# Voice spec — Daniel Whittaker

## Identity
<one paragraph: who Daniel is in writing — not who he is as a person, who he is on the page>

## Sentence rhythm
- <bullet observations about rhythm with examples in parentheses>

## Vocabulary
**Reach for:** <list of words/phrases Daniel uses>
**Avoid:** <list of words/phrases that don't sound like him>

## Register
<one paragraph on tone, where on the warmth/bluntness/formality axes, how it shifts>

## Don'ts (anti-patterns)
- <specific things Daniel never does>

## The cheese rules
- No manufactured drama
- No vague specifics
- No guru voice
- No transformation porn
- No fake reluctance

## Anchor paragraphs

The following paragraphs are real Daniel writing. Match this rhythm, vocabulary, and register exactly.

> <Daniel's first sample paragraph>

> <Daniel's second sample paragraph>

> <Daniel's third sample paragraph>
\`\`\`

**Step 4 — Iterate with Daniel.**

Show him the draft. Ask: "What's missing? What's wrong? What's there but doesn't quite sound like you?" Refine until he says "yes, that captures it".

## Output requirements

- Length: aim for 800–1500 words (long enough to constrain a downstream LLM, short enough to fit in context with everything else).
- The result should be DIRECTLY pasteable into the voice spec field at \`/dashboard/email-campaigns/sequence?tab=voice\` in Daniel's admin.
- Do NOT include the literal string \`${VOICE_SPEC_STUB_MARKER}\` anywhere — that's a sentinel that triggers a fail-safe in his system.

${CHEESE_RULES}

Begin by asking Daniel for samples. Do not draft until you've seen at least 3.`;
}

export function buildRolePrompt(
  role: Role,
  voiceSpec: string,
  briefsByRole: Record<Role, { workedExample: string }>,
): string {
  const details = ROLE_DETAILS[role];
  const orderIndex = ROLES.indexOf(role);

  return `${FRAMEWORK_INTRO}

---

## Today's task: author the WORKED EXAMPLE for the "${role}" email

This is email ${orderIndex + 1} of 7 in the sequence — the ${ROLE_LABELS[role]} role.

The "worked example" is a complete email written in Daniel's voice. It will be loaded into the LLM prompt every time it generates this email for a real prospect — as a stylistic anchor, not to be copied. So it must be a fully-formed, complete email that Daniel would be happy to send as-is.

## What this role must do

**Purpose:** ${details.purpose}

**Required beats:** ${details.requiredBeats}

**Loops to open:** ${details.loopsToOpen}

**Loops to close:** ${details.loopsToClose}

**Tone:** ${details.tone}

**Length:** ${details.lengthGuide}

## Daniel's voice — match this exactly

${voiceSpecBlock(voiceSpec)}

## Earlier emails in the sequence (worked examples already authored)

${priorRolesBlock(role, briefsByRole)}

## Process — follow this exactly

**Step 1 — Probe Daniel for the raw material.**

${details.probingQuestions}

Ask one or two at a time. Do NOT draft until Daniel has answered enough to give you concrete, specific material. Generic answers ("I had a realisation", "discipline matters") are a signal to push harder for the actual moment.

**Step 2 — Draft the worked example.**

Write a complete email that:
- Opens cold (no "Hi {firstName}" — that's added at LLM-rewrite time)
- Hits every required beat above
- Opens the specified loops; closes the prior ones
- Matches Daniel's voice exactly
- Reads in ${details.lengthGuide}
- Uses the specifics Daniel gave you in Step 1 — not paraphrased, not made polished. The texture of the real moment is the point.

Format the output as a self-contained piece of writing — subject line on top, then body. No HTML. No "[name placeholder]" markers; write it as if to a single concrete reader.

**Step 3 — The pub test.**

Read it aloud to yourself. Then ask Daniel: "Does this read like something you'd say to a friend at the pub? Or does it read like something you wrote because someone told you to?" Iterate until he says yes.

${CHEESE_RULES}

## Output

The result should be DIRECTLY pasteable into the "Worked example" field for the ${role} brief at \`/dashboard/email-campaigns/sequence?tab=briefs\` in Daniel's admin.

Begin by asking Daniel the probing questions. Do not draft until he's given you concrete, specific material.`;
}
