import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { anySignal, timeoutSignal } from "../utils/abort.js";
import { withProviderRetry } from "./retry.js";
import type { Provider, ProviderCall, ProviderResult } from "./types.js";

const google = new GoogleGenerativeAI(env.GOOGLE_GENERATIVE_AI_API_KEY || "missing-gemini-key");

export const runGemini: Provider = async (call: ProviderCall): Promise<ProviderResult> => {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for Gemini provider");
  }

  const started = Date.now();
  const signal = anySignal([call.signal, timeoutSignal(call.timeoutMs)]);
  const model = google.getGenerativeModel({
    model: env.GEMINI_MODEL,
    systemInstruction: call.system,
  });

  const result = await withProviderRetry(
    `gemini:${call.role}`,
    () => model.generateContent([{ text: call.user }], { signal }),
    signal,
  );

  return {
    role: call.role,
    text: result.response.text(),
    model: env.GEMINI_MODEL,
    latencyMs: Date.now() - started,
    timedOut: signal.aborted && !call.signal.aborted,
  };
};
