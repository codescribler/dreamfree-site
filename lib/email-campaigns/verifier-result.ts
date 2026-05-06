export interface VerifierFlag {
  role: string;
  note: string;
}

export interface VerifierResult {
  voice: VerifierFlag[];
  loops: VerifierFlag[];
  cheese: VerifierFlag[];
  factual: VerifierFlag[];
}

export class VerifierResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifierResultError";
  }
}

function asFlagArray(raw: unknown, label: string): VerifierFlag[] {
  if (!Array.isArray(raw)) {
    throw new VerifierResultError(`${label} must be an array`);
  }
  return raw.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).role !== "string" ||
      typeof (item as Record<string, unknown>).note !== "string"
    ) {
      throw new VerifierResultError(
        `${label} entries must have string role and note`,
      );
    }
    return {
      role: (item as Record<string, string>).role,
      note: (item as Record<string, string>).note,
    };
  });
}

export function validateVerifierResult(raw: unknown): VerifierResult {
  if (typeof raw !== "object" || raw === null) {
    throw new VerifierResultError("Verifier result is not an object");
  }
  const r = raw as Record<string, unknown>;
  return {
    voice: asFlagArray(r.voice, "voice"),
    loops: asFlagArray(r.loops, "loops"),
    cheese: asFlagArray(r.cheese, "cheese"),
    factual: asFlagArray(r.factual, "factual"),
  };
}
