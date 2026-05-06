const PER_CALL_TIMEOUT_MS = 90_000;

export interface OpenRouterCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  /** Set to "json_object" to force JSON output. Default undefined = free-form. */
  responseFormat?: "json_object";
  /** Optional title for OpenRouter's dashboard tagging. */
  title?: string;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

/**
 * Calls OpenRouter and returns the raw assistant message content.
 * Throws OpenRouterError on HTTP/upstream failures, empty responses, or timeouts.
 */
export async function callOpenRouter(
  opts: OpenRouterCallOptions,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY env var is not set");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dreamfree.co.uk",
      "X-OpenRouter-Title": opts.title ?? "Dreamfree Email Campaigns",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      temperature: opts.temperature,
      ...(opts.responseFormat === "json_object" && {
        response_format: { type: "json_object" },
      }),
    }),
    signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenRouterError(
      `OpenRouter HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`,
      res.status,
    );
  }

  const data = await res.json();
  if (data.error) {
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error.message || JSON.stringify(data.error);
    throw new OpenRouterError(`OpenRouter error: ${message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new OpenRouterError(
      `Empty response (finish_reason=${data.choices?.[0]?.finish_reason ?? "unknown"})`,
    );
  }

  return content;
}

/**
 * Strips markdown fences and trims whitespace, then parses JSON. Uses jsonrepair
 * if a strict parse fails — matches the pattern in lib/insights-prompt.
 */
export function parseLlmJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // jsonrepair is already a project dep — fix common LLM JSON drift
    // (trailing commas, unescaped quotes inside strings, etc.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { jsonrepair } = require("jsonrepair");
    return JSON.parse(jsonrepair(cleaned)) as T;
  }
}
