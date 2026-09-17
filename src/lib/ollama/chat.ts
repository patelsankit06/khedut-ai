import { AppError } from "@/lib/errors";
import type { ChatTurn } from "@/lib/chatTurn";

interface StreamAnswerParams {
  baseUrl: string;
  model: string;
  systemInstruction: string;
  // Prior conversation turns followed by the current user turn - lets the
  // model resolve follow-ups ("yes", "tell me more") using Ollama's native
  // multi-turn chat, instead of every question being answered in isolation.
  messages: ChatTurn[];
}

interface OllamaChatLine {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

/**
 * Streams the model's answer as plain text chunks from Ollama's
 * `/api/chat` endpoint (newline-delimited JSON, one object per line).
 * Ollama runs locally with no rate limits, so unlike the Gemini adapter
 * this doesn't need retry/backoff - a failure here means the server isn't
 * running or the model isn't pulled, not transient overload.
 */
export async function* streamAnswer(params: StreamAnswerParams): AsyncGenerator<string, void, unknown> {
  let response: Response;
  try {
    response = await fetch(`${params.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        stream: true,
        messages: [{ role: "system", content: params.systemInstruction }, ...params.messages],
      }),
    });
  } catch (error) {
    throw toUnavailableError(params.baseUrl, error);
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw toApiError(params, text || `HTTP ${response.status}`);
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
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as OllamaChatLine;
        if (parsed.error) throw toApiError(params, parsed.error);
        if (parsed.message?.content) yield parsed.message.content;
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw toApiError(params, error instanceof Error ? error.message : String(error));
  }
}

function toUnavailableError(baseUrl: string, error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(
    "MODEL_UNAVAILABLE",
    `Could not reach Ollama at ${baseUrl}. Is 'ollama serve' running? (${message})`,
    503
  );
}

function toApiError(params: StreamAnswerParams, message: string): AppError {
  if (/model .* not found/i.test(message)) {
    return new AppError(
      "MODEL_UNAVAILABLE",
      `Model "${params.model}" isn't pulled yet. Run: ollama pull ${params.model}`,
      503
    );
  }
  return new AppError("MODEL_API_ERROR", `Ollama chat request failed: ${message}`, 502);
}
