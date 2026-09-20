import { GoogleGenAI } from "@google/genai";
import { AppError } from "@/lib/errors";
import type { ChatTurn } from "@/lib/chatTurn";
import { isAuthOrBadRequestError, isRateLimitError, isServiceUnavailableError, withRetry } from "./retry";

interface StreamAnswerParams {
  apiKey: string;
  model: string;
  systemInstruction: string;
  // Prior conversation turns followed by the current user turn - mirrors
  // the Ollama adapter's shape (src/lib/ollama/chat.ts) so the chat route
  // can call either provider the same way.
  messages: ChatTurn[];
}

/**
 * Streams the model's answer as plain text chunks. The initial request is
 * retried on transient failures; once tokens start arriving, a failure is
 * surfaced immediately instead of retried, to avoid duplicating partial output.
 */
export async function* streamAnswer(params: StreamAnswerParams): AsyncGenerator<string, void, unknown> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });

  // Gemini uses "model" where our ChatTurn uses "assistant".
  const contents = params.messages.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  let stream: AsyncGenerator<{ text?: string }>;
  try {
    stream = await withRetry(() =>
      ai.models.generateContentStream({
        model: params.model,
        contents,
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
  if (isServiceUnavailableError(error)) {
    return new AppError(
      "MODEL_UNAVAILABLE",
      "Gemini's model is temporarily overloaded (Google's free-tier flash model sees demand spikes). This was already retried automatically - please wait a few seconds and try again.",
      503
    );
  }
  if (isAuthOrBadRequestError(error)) {
    return new AppError("MODEL_API_ERROR", `Gemini request rejected: ${message}`, 502);
  }
  return new AppError("MODEL_API_ERROR", `Gemini request failed: ${message}`, 502);
}
