import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { AppError, toErrorPayload } from "@/lib/errors";
import { retrieve, buildPrompt, SYSTEM_INSTRUCTION } from "@/lib/retrieval";
import { streamAnswer as streamOllamaAnswer } from "@/lib/ollama/chat";
import { streamAnswer as streamGeminiAnswer } from "@/lib/gemini/chat";
import type { ChatTurn } from "@/lib/chatTurn";

export const runtime = "nodejs";
// Streamed generation can run well past Vercel's 10s default - raise the cap.
// Actual max is plan-dependent (Hobby vs Pro); lower this if your plan caps below 60.
export const maxDuration = 60;

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const requestSchema = z.object({
  question: z.string().min(1).max(2000),
  crop: z.string().min(1).max(50).optional(),
  // Overrides the server's default provider (LLM_PROVIDER in .env.local)
  // for this request - lets the sidebar toggle switch models per session
  // without a server restart.
  provider: z.enum(["ollama", "gemini"]).optional(),
  // Recent prior turns, oldest first - lets the model resolve follow-ups
  // ("yes", "tell me more") instead of every question being answered in
  // isolation. Capped client-side; capped again here defensively.
  history: z.array(historyTurnSchema).max(20).optional(),
});

function encodeLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function errorResponse(error: unknown): Response {
  const { body, status } = toErrorPayload(error);
  return Response.json(body, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(new AppError("INVALID_REQUEST", "Invalid JSON body.", 400));
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(new AppError("INVALID_REQUEST", "Body must be { question: string } (1-2000 chars).", 400));
  }
  const { question, crop, history } = parsed.data;
  const config = getConfig();
  const provider = parsed.data.provider ?? config.llmProvider;

  if (provider === "gemini" && !config.geminiApiKey) {
    return errorResponse(
      new AppError("MODEL_UNAVAILABLE", "GEMINI_API_KEY is not set. Add it to .env.local to use Gemini.", 503)
    );
  }

  let citations;
  let contextBlock;
  try {
    ({ citations, contextBlock } = await retrieve(question, crop, provider));
  } catch (error) {
    return errorResponse(error);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeLine({ type: "citations", data: citations }));

      try {
        const currentTurn: ChatTurn = { role: "user", content: buildPrompt(question, contextBlock, crop) };
        const messages: ChatTurn[] = [...(history ?? []), currentTurn];

        const tokens =
          provider === "gemini"
            ? streamGeminiAnswer({
                apiKey: config.geminiApiKey!,
                model: config.geminiChatModel,
                systemInstruction: SYSTEM_INSTRUCTION,
                messages,
              })
            : streamOllamaAnswer({
                baseUrl: config.ollamaUrl,
                model: config.ollamaChatModel,
                systemInstruction: SYSTEM_INSTRUCTION,
                messages,
              });

        for await (const textChunk of tokens) {
          controller.enqueue(encodeLine({ type: "token", data: textChunk }));
        }
        controller.enqueue(encodeLine({ type: "done" }));
      } catch (error) {
        const { body: errBody } = toErrorPayload(error);
        controller.enqueue(encodeLine({ type: "error", message: errBody.error.message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
