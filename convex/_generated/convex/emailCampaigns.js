import { internalMutation } from "./_generated/server";
import { ROLES, DEFAULT_ROLE_GAPS_MS, VOICE_SPEC_STUB_BODY, } from "../lib/email-campaigns/roles";
const SKELETON_BRIEFS = {
    orientation: {
        purpose: "Introduce Daniel, set up what's coming, and surface the one most striking finding from the report. Make the reader want the next email.",
        requiredBeats: "Greet them by first name. Reference the URL audited. Surface ONE concrete finding from the report (not the worst score — the most interesting one). Tease one specific weird detail about Daniel's story or the upcoming sequence as an open loop. Promise the next email.",
        loopsToOpen: "One narrative loop pointing at the backstory email — a specific, weird, concrete detail from Daniel's story (e.g. 'why I closed my laptop and walked out for two hours').",
        loopsToClose: "None — first email.",
        tone: "Warm but not over-friendly. Direct. Reads like Daniel sat down after looking at their site and wrote them.",
        lengthGuide: "120-180 words.",
        workedExample: "[FILL IN — write a complete orientation email in Daniel's voice for a fictional plumber who scored 6/10. Use it as a stylistic anchor for the LLM.]",
    },
    backstory: {
        purpose: "Establish where Daniel was before — humanise him, make the reader care. Open the loop that closes in the wall email.",
        requiredBeats: "Brief Royal Marine context (background, not theme). What Daniel was doing before web strategy. What was at risk for him personally.",
        loopsToOpen: "Tease the moment things had to change ('the wall').",
        loopsToClose: "Close the orientation loop's specific detail (deliver the consultant line, the laptop moment, etc.).",
        tone: "Reflective, not dramatic. Specific not vague.",
        lengthGuide: "150-220 words.",
        workedExample: "[FILL IN]",
    },
    wall: {
        purpose: "The crisis point. The moment Daniel realised the old approach wasn't working.",
        requiredBeats: "A specific incident or realisation. What broke. What he saw that he hadn't before. Should mirror the recipient's likely weakness from the report — if their CTA is weak, the wall is when Daniel realised CTAs were the issue. If their messaging is weak, the wall is messaging.",
        loopsToOpen: "Tease the new lens (epiphany).",
        loopsToClose: "Close the loop opened in the backstory email.",
        tone: "Honest. No transformation porn.",
        lengthGuide: "150-220 words.",
        workedExample: "[FILL IN]",
    },
    epiphany: {
        purpose: "The shift in thinking. The new lens. Name the principle the recipient is violating and reframe it.",
        requiredBeats: "The principle (generic). The recipient's specific violation (from the report). Why the old way fails and the new way works.",
        loopsToOpen: "Tease how the new way actually works in practice (application email).",
        loopsToClose: "Close the loop opened in the wall email.",
        tone: "Confident but not preachy.",
        lengthGuide: "180-250 words.",
        workedExample: "[FILL IN]",
    },
    application: {
        purpose: "Show how the new way actually works, with proof. Apply it to the recipient's site.",
        requiredBeats: "Concrete mechanism. Evidence (case, before/after, principle in action). Rewrite one section of the recipient's actual copy, OR describe what their hero would look like fixed.",
        loopsToOpen: "Tease a second-order benefit the reader hasn't thought of (hidden benefits email).",
        loopsToClose: "Close the loop opened in the epiphany email.",
        tone: "Practical. Working-out-loud.",
        lengthGuide: "200-280 words.",
        workedExample: "[FILL IN]",
    },
    hidden_benefits: {
        purpose: "Surface second-order benefits — each quietly answers a likely objection.",
        requiredBeats: "Two or three benefits the reader hadn't considered. Tied to their industry context (plumber's hidden benefits look different from a hearing clinic's). Each benefit pre-empts a different objection.",
        loopsToOpen: "Tease the offer — what comes next, why now.",
        loopsToClose: "Close the loop opened in the application email.",
        tone: "Generous. Like sharing what you've noticed.",
        lengthGuide: "180-250 words.",
        workedExample: "[FILL IN]",
    },
    offer: {
        purpose: "Make the ask. Name the gap between where they are (per their report) and where the offer takes them.",
        requiredBeats: "Reference the specific gap from their report. The offer (subscription tier most appropriate to their score and business). Why now. Clear CTA — reply to the email.",
        loopsToOpen: "None — last email.",
        loopsToClose: "Close every remaining open loop.",
        tone: "Direct. No reluctance theatre.",
        lengthGuide: "180-250 words.",
        workedExample: "[FILL IN]",
    },
};
export const seed = internalMutation({
    args: {},
    handler: async (ctx) => {
        const existingConfig = await ctx.db.query("campaignConfig").first();
        if (existingConfig) {
            console.log("emailCampaigns:seed — already seeded, noop");
            return { seeded: false };
        }
        const now = Date.now();
        const adminEmail = "daniel@dreamfree.co.uk";
        await ctx.db.insert("campaignConfig", {
            globalKillSwitch: true,
            killSwitchUpdatedAt: now,
            fromAddress: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
            defaultLlmModel: "google/gemini-2.5-flash",
            businessHoursEnabled: true,
            businessHoursStartUtcMinutes: 9 * 60,
            businessHoursEndUtcMinutes: 18 * 60,
            businessDays: [1, 2, 3, 4, 5],
            unsubscribeBaseUrl: "https://dreamfree.co.uk/unsubscribe",
        });
        const sequenceId = await ctx.db.insert("emailSequences", {
            name: "Signal Report Soap Opera",
            description: "Triggered when a Signal Report completes. 7 emails, LLM-personalised against the recipient's report findings.",
            trigger: "signal_report_success",
            isActive: true,
            roleGaps: DEFAULT_ROLE_GAPS_MS,
            orientationRespectsBusinessHours: false,
            createdAt: now,
            updatedAt: now,
        });
        for (let i = 0; i < ROLES.length; i++) {
            const role = ROLES[i];
            const skeleton = SKELETON_BRIEFS[role];
            await ctx.db.insert("emailRoleBriefs", {
                sequenceId,
                role,
                order: i,
                purpose: skeleton.purpose,
                requiredBeats: skeleton.requiredBeats,
                loopsToOpen: skeleton.loopsToOpen,
                loopsToClose: skeleton.loopsToClose,
                tone: skeleton.tone,
                lengthGuide: skeleton.lengthGuide,
                workedExample: skeleton.workedExample,
                version: 1,
                isCurrent: true,
                createdAt: now,
                createdBy: adminEmail,
            });
        }
        await ctx.db.insert("emailVoiceSpec", {
            body: VOICE_SPEC_STUB_BODY,
            version: 1,
            isCurrent: true,
            createdAt: now,
            createdBy: adminEmail,
        });
        console.log(`emailCampaigns:seed — inserted config + sequence ${sequenceId} + ${ROLES.length} briefs + voice stub`);
        return { seeded: true, sequenceId };
    },
});
