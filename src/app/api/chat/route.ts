import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig, type AppConfig } from "@/lib/config";
import { AppError, toErrorPayload } from "@/lib/errors";
import { retrieve, buildPrompt, SYSTEM_INSTRUCTION } from "@/lib/retrieval";
import { streamAnswer } from "@/lib/gemini/chat";

export const runtime = "nodejs";

const requestSchema = z.object({ question: z.string().min(1).max(2000) });

function encodeLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function tryGetConfig(): AppConfig | null {
  try {
    return getConfig();
  } catch {
    return null;
  }
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
  const { question } = parsed.data;

  const config = tryGetConfig();
  if (!config) {
    return errorResponse(new AppError("GEMINI_API_ERROR", "GEMINI_API_KEY is not configured on the server.", 502));
  }

  let citations;
  let contextBlock;
  try {
    ({ citations, contextBlock } = await retrieve(question));
  } catch (error) {
    return errorResponse(error);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (citations.length === 0) {
        controller.enqueue(encodeLine({ type: "citations", data: [] }));
        controller.enqueue(
          encodeLine({
            type: "token",
            data: "No documents have been uploaded yet. Upload a PDF, DOCX, TXT, or Markdown file first, then ask again.",
          })
        );
        controller.enqueue(encodeLine({ type: "done" }));
        controller.close();
        return;
      }

      controller.enqueue(encodeLine({ type: "citations", data: citations }));

      try {
        const prompt = buildPrompt(question, contextBlock);
        for await (const textChunk of streamAnswer({
          apiKey: config.geminiApiKey,
          model: config.geminiChatModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          prompt,
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
