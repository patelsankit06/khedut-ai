import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { AppError, toErrorPayload } from "@/lib/errors";
import { retrieve, buildPrompt, SYSTEM_INSTRUCTION } from "@/lib/retrieval";
import { streamAnswer } from "@/lib/ollama/chat";
import type { ChatTurn } from "@/lib/chatTurn";

export const runtime = "nodejs";

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const requestSchema = z.object({
  question: z.string().min(1).max(2000),
  crop: z.string().min(1).max(50).optional(),
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

  let citations;
  let contextBlock;
  try {
    ({ citations, contextBlock } = await retrieve(question, crop));
  } catch (error) {
    return errorResponse(error);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeLine({ type: "citations", data: citations }));

      try {
        const currentTurn: ChatTurn = { role: "user", content: buildPrompt(question, contextBlock, crop) };
        const messages: ChatTurn[] = [...(history ?? []), currentTurn];

        for await (const textChunk of streamAnswer({
          baseUrl: config.ollamaUrl,
          model: config.ollamaChatModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          messages,
        })) {
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
