export class VerifierResultError extends Error {
    constructor(message) {
        super(message);
        this.name = "VerifierResultError";
    }
}
function asFlagArray(raw, label) {
    if (!Array.isArray(raw)) {
        throw new VerifierResultError(`${label} must be an array`);
    }
    return raw.map((item) => {
        if (typeof item !== "object" ||
            item === null ||
            typeof item.role !== "string" ||
            typeof item.note !== "string") {
            throw new VerifierResultError(`${label} entries must have string role and note`);
        }
        return {
            role: item.role,
            note: item.note,
        };
    });
}
export function validateVerifierResult(raw) {
    if (typeof raw !== "object" || raw === null) {
        throw new VerifierResultError("Verifier result is not an object");
    }
    const r = raw;
    return {
        voice: asFlagArray(r.voice, "voice"),
        loops: asFlagArray(r.loops, "loops"),
        cheese: asFlagArray(r.cheese, "cheese"),
        factual: asFlagArray(r.factual, "factual"),
    };
}
