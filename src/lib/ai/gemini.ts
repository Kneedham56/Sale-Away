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
  /** Tried once if the main model stays overloaded (503), is out of quota, or is too slow */
  fallbackModel?: string;
  /** How long to wait for the main model before handing over to the fallback (default: its whole timeout) */
  mainTimeoutMs?: number;
};

class Overloaded extends Error {}
class QuotaUsed extends Error {}
class TooSlow extends Error {}

// Gemini 3 "flash" models think before answering; for a listing, a little thinking is plenty and far faster
// (one of her listings took 88s by default, 68s on low, and has taken over 4 minutes when Google is busy).
const thinksLess = (model: string) => /latest|gemini-3/i.test(model) && !/lite/i.test(model);

/**
 * Retries "high demand" (503) twice with backoff, then tries the fallback model if one is given.
 * A main model that's too slow (mainTimeoutMs) also hands over to the fallback, so she always gets an answer.
 */
export async function callGemini(opts: CallOpts): Promise<GeminiResult & { fellBack: boolean }> {
  const hasFallback = !!opts.fallbackModel && opts.fallbackModel !== opts.model;
  const main = { ...opts, timeoutMs: hasFallback ? (opts.mainTimeoutMs ?? opts.timeoutMs) : opts.timeoutMs };
  let slow = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { ...(await callOnce(main)), fellBack: false };
    } catch (e) {
      if (e instanceof QuotaUsed) break; // retrying won't help until the quota resets
      if (e instanceof TooSlow && hasFallback) {
        slow = true;
        break;
      }
      if (!(e instanceof Overloaded)) throw e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, attempt === 0 ? 3000 : 8000));
    }
  }
  if (hasFallback) {
    try {
      return { ...(await callOnce({ ...opts, model: opts.fallbackModel!, timeoutMs: 60_000 })), fellBack: true };
    } catch (e) {
      if (!(e instanceof Overloaded) && !(e instanceof QuotaUsed) && !(e instanceof TooSlow)) throw e;
    }
  }
  throw new Error(
    slow
      ? "Gemini is very slow right now. Try again in a few minutes, or use Copy Prompt."
      : "Gemini is busy or today's free quota is used up. Try again later, or use Copy Prompt."
  );
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
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: opts.schema,
          temperature: 0.4,
          ...(thinksLess(opts.model) ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
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
    if (e instanceof Error && e.name === "AbortError") throw new TooSlow("Gemini took too long. Try again or use Copy Prompt.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
