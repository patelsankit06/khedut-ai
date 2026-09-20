import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { AppError, toErrorPayload } from "@/lib/errors";
import { loadDocument } from "@/lib/parsing/loadDocument";
import { deriveDocumentId } from "@/lib/parsing/types";
import { chunkDocuments } from "@/lib/chunking";
import { getIngestStore, toVectorStoreError } from "@/lib/vectorstore";
import { addDocument } from "@/lib/documentRegistry";
import { saveDocumentContent } from "@/lib/documentContent";

export const runtime = "nodejs";
// Embedding a large uploaded document can take a while - raise the cap past
// Vercel's 10s default. Actual max is plan-dependent (Hobby vs Pro).
export const maxDuration = 60;

const providerSchema = z.enum(["ollama", "gemini"]);

export async function POST(request: NextRequest) {
  try {
    const config = getConfig();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError(
        "INVALID_REQUEST",
        "No file provided. Send a multipart/form-data request with a 'file' field.",
        400
      );
    }

    // Uploads are embedded and stored under whichever provider is currently
    // selected in the UI, so they land in that provider's Chroma collection
    // alongside the seeded knowledge base for it.
    const parsedProvider = providerSchema.safeParse(formData.get("provider"));
    const provider = parsedProvider.success ? parsedProvider.data : config.llmProvider;
    if (provider === "gemini" && !config.geminiApiKey) {
      throw new AppError("MODEL_UNAVAILABLE", "GEMINI_API_KEY is not set. Add it to .env.local to use Gemini.", 503);
    }

    if (file.size === 0) {
      throw new AppError("EMPTY_DOCUMENT", `"${file.name}" is empty.`, 422);
    }
    if (file.size > config.maxUploadBytes) {
      const limitMb = Math.round(config.maxUploadBytes / (1024 * 1024));
      throw new AppError("FILE_TOO_LARGE", `"${file.name}" exceeds the ${limitMb}MB upload limit.`, 413);
    }

    const uploadId = deriveDocumentId(file.name);
    const docs = await loadDocument(file, file.name);
    await saveDocumentContent(uploadId, docs.map((doc) => doc.pageContent).join("\n\n"));

    const chunks = await chunkDocuments(docs, { uploadId, filename: file.name });
    // Uploads aren't tagged to a specific crop, but every chunk needs a
    // `crop` field so crop-filtered queries (which also match "general") can
    // still find them.
    chunks.forEach((chunk) => {
      chunk.metadata.crop = "general";
    });

    try {
      await getIngestStore(provider).addDocuments(chunks, {
        ids: chunks.map((chunk) => chunk.metadata.id as string),
      });
    } catch (error) {
      throw toVectorStoreError(error);
    }

    await addDocument({
      id: uploadId,
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length,
    });

    return NextResponse.json({ documentId: uploadId, filename: file.name, chunkCount: chunks.length });
  } catch (error) {
    const { body, status } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}
