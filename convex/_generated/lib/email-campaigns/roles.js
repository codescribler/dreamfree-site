export const ROLES = [
    "orientation",
    "backstory",
    "wall",
    "epiphany",
    "application",
    "hidden_benefits",
    "offer",
];
export const ROLE_LABELS = {
    orientation: "Orientation",
    backstory: "Backstory & stakes",
    wall: "The wall",
    epiphany: "The epiphany",
    application: "Application & proof",
    hidden_benefits: "Hidden benefits",
    offer: "The offer",
};
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Gap to wait BEFORE sending each role, measured from the previous role's send.
 * Index matches ROLES. Index 0 (orientation) is 0 because the orientation
 * email's send time is computed from the trigger time, not from a previous send.
 */
export const DEFAULT_ROLE_GAPS_MS = [
    0,
    1 * DAY_MS,
    1 * DAY_MS,
    2 * DAY_MS,
    2 * DAY_MS,
    3 * DAY_MS,
    3 * DAY_MS,
];
/** Sentinel string that, if present in the voice spec, makes the verifier flag every draft. */
export const VOICE_SPEC_STUB_MARKER = "<<VOICE SPEC STUB>>";
/** The text inserted into the voice spec when seeding. */
export const VOICE_SPEC_STUB_BODY = `${VOICE_SPEC_STUB_MARKER}

Voice spec — fill me in. The system flags every draft as voice-failed while this stub is in place. See the design spec at docs/superpowers/specs/2026-05-06-personalised-email-campaigns-design.md for what to write.`;
