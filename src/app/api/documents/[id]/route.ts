import { NextResponse } from "next/server";
import { listDocuments, removeDocument } from "@/lib/documentRegistry";
import { readDocumentContent, deleteDocumentContent } from "@/lib/documentContent";
import { AppError, toErrorPayload } from "@/lib/errors";
import { getIngestStore, toVectorStoreError } from "@/lib/vectorstore";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const documents = await listDocuments();
    const record = documents.find((doc) => doc.id === id);
    if (!record) {
      throw new AppError("NOT_FOUND", "Document not found.", 404);
    }

    const content = await readDocumentContent(id);
    if (content === null) {
      throw new AppError("NOT_FOUND", "Document content is no longer available.", 404);
    }

    return NextResponse.json({ id: record.id, filename: record.filename, content });
  } catch (error) {
    const { body, status } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const documents = await listDocuments();
    const record = documents.find((doc) => doc.id === id);
    if (!record) {
      throw new AppError("NOT_FOUND", "Document not found.", 404);
    }

    try {
      await getIngestStore().delete({ filter: { documentId: id } });
    } catch (error) {
      throw toVectorStoreError(error);
    }

    await removeDocument(id);
    await deleteDocumentContent(id);

    return NextResponse.json({ id });
  } catch (error) {
    const { body, status } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}
