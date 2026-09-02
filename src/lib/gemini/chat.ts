import { GoogleGenAI } from "@google/genai";
import { AppError } from "@/lib/errors";
import { isAuthOrBadRequestError, isRateLimitError, withRetry } from "./retry";

interface StreamAnswerParams {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
}

/**
 * Streams the model's answer as plain text chunks. The initial request is
 * retried on transient failures; once tokens start arriving, a failure is
 * surfaced immediately instead of retried, to avoid duplicating partial output.
 */
export async function* streamAnswer(params: StreamAnswerParams): AsyncGenerator<string, void, unknown> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });

  let stream: AsyncGenerator<{ text?: string }>;
  try {
    stream = await withRetry(() =>
      ai.models.generateContentStream({
        model: params.model,
        contents: params.prompt,
        config: { systemInstruction: params.systemInstruction },
      })
    );
  } catch (error) {
    throw toAppError(error);
  }

  try {
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  } catch (error) {
    throw toAppError(error);
  }
}

function toAppError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  if (isRateLimitError(error)) {
    return new AppError(
      "RATE_LIMITED",
      "Gemini free-tier rate limit hit. Please wait a moment and try again.",
      429
    );
  }
  if (isAuthOrBadRequestError(error)) {
    return new AppError("GEMINI_API_ERROR", `Gemini request rejected: ${message}`, 502);
  }
  return new AppError("GEMINI_API_ERROR", `Gemini request failed: ${message}`, 502);
}
