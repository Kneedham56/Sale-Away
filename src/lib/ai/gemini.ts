import "server-only";

export type InlineImage = { mimeType: string; base64: string };

export type GeminiResult = {
  json: unknown;
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

const API = "https://generativelanguage.googleapis.com/v1beta/models";

/** One structured-output call with images. Throws a readable error on failure. */
type CallOpts = {
  model: string;
  prompt: string;
  images: InlineImage[];
  schema: object;
  timeoutMs?: number;
  /** Tried once if the main model stays overloaded (503) after retries */
  fallbackModel?: string;
};

class Overloaded extends Error {}
class QuotaUsed extends Error {}

/** Retries "high demand" (503) twice with backoff, then tries the fallback model if one is given. */
export async function callGemini(opts: CallOpts): Promise<GeminiResult & { fellBack: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { ...(await callOnce(opts)), fellBack: false };
    } catch (e) {
      if (e instanceof QuotaUsed) break; // retrying won't help until the quota resets
      if (!(e instanceof Overloaded)) throw e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, attempt === 0 ? 3000 : 8000));
    }
  }
  if (opts.fallbackModel && opts.fallbackModel !== opts.model) {
    try {
      return { ...(await callOnce({ ...opts, model: opts.fallbackModel })), fellBack: true };
    } catch (e) {
      if (!(e instanceof Overloaded) && !(e instanceof QuotaUsed)) throw e;
    }
  }
  throw new Error("Gemini is busy or today's free quota is used up. Try again later, or use Copy Prompt.");
}

async function callOnce(opts: CallOpts): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set. Use Copy Prompt mode, or add the key on the server.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 240_000);
  try {
    const res = await fetch(`${API}/${encodeURIComponent(opts.model)}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: opts.prompt },
              ...opts.images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: opts.schema, temperature: 0.4 },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 503 || /high demand|overloaded/i.test(msg)) throw new Overloaded(msg);
      if (res.status === 429) throw new QuotaUsed(msg);
      throw new Error(`Gemini error: ${msg}`);
    }
    const text: string = (body?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) throw new Error(`Gemini returned no answer (${body?.candidates?.[0]?.finishReason ?? "unknown reason"}).`);
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Gemini's answer wasn't valid JSON. Try again.");
    }
    return {
      json,
      text,
      model: body?.modelVersion ?? opts.model,
      inputTokens: body?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: (body?.usageMetadata?.candidatesTokenCount ?? 0) + (body?.usageMetadata?.thoughtsTokenCount ?? 0) || null,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Gemini took too long. Try again or use Copy Prompt.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
