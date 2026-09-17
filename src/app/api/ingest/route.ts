import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { AppError, toErrorPayload } from "@/lib/errors";
import { loadDocument } from "@/lib/parsing/loadDocument";
import { deriveDocumentId } from "@/lib/parsing/types";
import { chunkDocuments } from "@/lib/chunking";
import { getIngestStore, toVectorStoreError } from "@/lib/vectorstore";
import { addDocument } from "@/lib/documentRegistry";
import { saveDocumentContent } from "@/lib/documentContent";

export const runtime = "nodejs";

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
      await getIngestStore().addDocuments(chunks, {
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
