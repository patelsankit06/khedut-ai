import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { AppError, toErrorPayload } from "@/lib/errors";
import { loadKnowledgeBaseChunks } from "@/lib/knowledgeBase";
import { getIngestStore, toVectorStoreError } from "@/lib/vectorstore";
import { readKnowledgeBaseStatus, writeKnowledgeBaseStatus } from "@/lib/knowledgeBaseStatus";

export const runtime = "nodejs";

const providerSchema = z.enum(["ollama", "gemini"]);

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("provider");
  const parsed = providerSchema.safeParse(requested);
  const provider = parsed.success ? parsed.data : getConfig().llmProvider;

  const status = await readKnowledgeBaseStatus(provider);
  return NextResponse.json({ provider, status });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsedProvider = providerSchema.safeParse(body?.provider);
    const provider = parsedProvider.success ? parsedProvider.data : getConfig().llmProvider;

    if (provider === "gemini" && !getConfig().geminiApiKey) {
      throw new AppError("MODEL_UNAVAILABLE", "GEMINI_API_KEY is not set. Add it to .env.local to use Gemini.", 503);
    }

    const chunks = await loadKnowledgeBaseChunks();
    if (chunks.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        "No knowledge base files found in data/knowledge-base.",
        404
      );
    }

    const documentIds = Array.from(new Set(chunks.map((chunk) => chunk.metadata.documentId as string)));

    try {
      // Best-effort: clears any previously seeded chunks for these crops so
      // re-seeding after editing a knowledge-base file doesn't leave stale
      // chunks behind. Fine if nothing existed yet.
      await getIngestStore(provider).delete({ filter: { documentId: { $in: documentIds } } });
    } catch {
      // ignore - nothing to delete yet
    }

    try {
      await getIngestStore(provider).addDocuments(chunks, {
        ids: chunks.map((chunk) => chunk.metadata.id as string),
      });
    } catch (error) {
      throw toVectorStoreError(error);
    }

    const perCrop: Record<string, number> = {};
    for (const chunk of chunks) {
      const crop = chunk.metadata.crop as string;
      perCrop[crop] = (perCrop[crop] ?? 0) + 1;
    }

    const status = {
      seededAt: new Date().toISOString(),
      totalChunks: chunks.length,
      perCrop,
    };
    await writeKnowledgeBaseStatus(provider, status);

    return NextResponse.json({ provider, ...status });
  } catch (error) {
    const { body, status } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}
