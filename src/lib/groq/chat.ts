import { AppError } from "@/lib/errors";
import type { ChatTurn } from "@/lib/chatTurn";

interface StreamAnswerParams {
  apiKey: string;
  model: string;
  systemInstruction: string;
  // Mirrors the Ollama/Gemini adapters' shape so the chat route can call any
  // provider the same way.
  messages: ChatTurn[];
}

interface GroqStreamChunk {
  choices?: { delta?: { content?: string } }[];
  error?: { message?: string };
}

/**
 * Streams the model's answer as plain text chunks from Groq's OpenAI-
 * compatible `/openai/v1/chat/completions` endpoint (server-sent events:
 * `data: <json>` lines, terminated by `data: [DONE]`). No retry/backoff -
 * Groq is being added specifically as a fast, separate-quota fallback for
 * when Gemini's free tier is exhausted, so a failure here should surface
 * immediately rather than retry into the same kind of rate limit.
 */
export async function* streamAnswer(params: StreamAnswerParams): AsyncGenerator<string, void, unknown> {
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        stream: true,
        messages: [
          { role: "system", content: params.systemInstruction },
          ...params.messages.map((turn) => ({ role: turn.role, content: turn.content })),
        ],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError("MODEL_UNAVAILABLE", `Could not reach Groq: ${message}`, 503);
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw toApiError(response.status, text || `HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (payload === "[DONE]") return;

        const parsed = JSON.parse(payload) as GroqStreamChunk;
        if (parsed.error) throw toApiError(response.status, parsed.error.message ?? "Groq stream error");
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw toApiError(response.status, error instanceof Error ? error.message : String(error));
  }
}

function toApiError(status: number, message: string): AppError {
  if (status === 429) {
    return new AppError("RATE_LIMITED", "Groq rate limit hit. Please wait a moment and try again.", 429);
  }
  if (status >= 500) {
    return new AppError(
      "MODEL_UNAVAILABLE",
      "Groq is temporarily unavailable. Please wait a few seconds and try again.",
      503
    );
  }
  if (status === 400 || status === 401 || status === 403) {
    return new AppError("MODEL_API_ERROR", `Groq request rejected: ${message}`, 502);
  }
  return new AppError("MODEL_API_ERROR", `Groq request failed: ${message}`, 502);
}
