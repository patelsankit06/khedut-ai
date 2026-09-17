import { NextResponse } from "next/server";
import { AppError, toErrorPayload } from "@/lib/errors";
import { loadKnowledgeBaseChunks } from "@/lib/knowledgeBase";
import { getIngestStore, toVectorStoreError } from "@/lib/vectorstore";
import { readKnowledgeBaseStatus, writeKnowledgeBaseStatus } from "@/lib/knowledgeBaseStatus";

export const runtime = "nodejs";

export async function GET() {
  const status = await readKnowledgeBaseStatus();
  return NextResponse.json({ status });
}

export async function POST() {
  try {
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
      await getIngestStore().delete({ filter: { documentId: { $in: documentIds } } });
    } catch {
      // ignore - nothing to delete yet
    }

    try {
      await getIngestStore().addDocuments(chunks, {
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
    await writeKnowledgeBaseStatus(status);

    return NextResponse.json(status);
  } catch (error) {
    const { body, status } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}
