export interface GenerationResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  loopsOpened: Array<{ id: string; description: string }>;
  loopsClosed: string[];
  reportFindingsUsed: string[];
}

export class GenerationResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationResultError";
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateGenerationResult(raw: unknown): GenerationResult {
  if (typeof raw !== "object" || raw === null) {
    throw new GenerationResultError("LLM result is not an object");
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.subject !== "string" || r.subject.length === 0) {
    throw new GenerationResultError("subject must be a non-empty string");
  }
  if (typeof r.bodyHtml !== "string" || r.bodyHtml.length === 0) {
    throw new GenerationResultError("bodyHtml must be a non-empty string");
  }
  if (typeof r.bodyText !== "string" || r.bodyText.length === 0) {
    throw new GenerationResultError("bodyText must be a non-empty string");
  }

  if (!Array.isArray(r.loopsOpened)) {
    throw new GenerationResultError("loopsOpened must be an array");
  }
  const loopsOpened: Array<{ id: string; description: string }> = [];
  for (const item of r.loopsOpened) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).id !== "string" ||
      typeof (item as Record<string, unknown>).description !== "string"
    ) {
      throw new GenerationResultError(
        "Each loopsOpened entry must have string id and description",
      );
    }
    loopsOpened.push({
      id: (item as Record<string, string>).id,
      description: (item as Record<string, string>).description,
    });
  }

  if (!isStringArray(r.loopsClosed)) {
    throw new GenerationResultError("loopsClosed must be an array of strings");
  }
  if (!isStringArray(r.reportFindingsUsed)) {
    throw new GenerationResultError(
      "reportFindingsUsed must be an array of strings",
    );
  }

  return {
    subject: r.subject,
    bodyHtml: r.bodyHtml,
    bodyText: r.bodyText,
    loopsOpened,
    loopsClosed: r.loopsClosed,
    reportFindingsUsed: r.reportFindingsUsed,
  };
}
