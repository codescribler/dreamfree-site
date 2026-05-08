const PER_CALL_TIMEOUT_MS = 90_000;

export interface MeteredCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  responseFormat?: "json_object";
}

export interface MeteredCallResult {
  output: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  rawResponse: unknown;
}

export class MeteredCallError extends Error {
  constructor(
    message: string,
    public readonly latencyMs: number,
    public readonly rawResponse?: unknown,
  ) {
    super(message);
    this.name = "MeteredCallError";
  }
}

export async function callOpenRouterMetered(
  opts: MeteredCallOptions,
): Promise<MeteredCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new MeteredCallError("OPENROUTER_API_KEY env var is not set", 0);
  }

  const start = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dreamfree.co.uk",
      "X-OpenRouter-Title": "Dreamfree Model Replay",
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

  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MeteredCallError(
      `OpenRouter HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`,
      latencyMs,
    );
  }

  const data = (await res.json()) as {
    error?: unknown;
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (data.error) {
    const message =
      typeof data.error === "string"
        ? data.error
        : (data.error as { message?: string }).message ?? JSON.stringify(data.error);
    throw new MeteredCallError(`OpenRouter error: ${message}`, latencyMs, data);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new MeteredCallError(
      `Empty response (finish_reason=${data.choices?.[0]?.finish_reason ?? "unknown"})`,
      latencyMs,
      data,
    );
  }

  return {
    output: content,
    latencyMs,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    rawResponse: data,
  };
}
