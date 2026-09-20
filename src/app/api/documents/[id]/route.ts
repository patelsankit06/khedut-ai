import { NextResponse } from "next/server";
import { listDocuments, removeDocument } from "@/lib/documentRegistry";
import { readDocumentContent, deleteDocumentContent } from "@/lib/documentContent";
import { AppError, toErrorPayload } from "@/lib/errors";
import { getIngestStore } from "@/lib/vectorstore";
import type { LlmProvider } from "@/lib/config";

const PROVIDERS: LlmProvider[] = ["ollama", "gemini"];

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

    // Uploads aren't tracked by which provider ingested them, so best-effort
    // delete from both providers' collections - a no-op wherever the id
    // doesn't exist (including when Gemini isn't configured at all).
    for (const provider of PROVIDERS) {
      try {
        await getIngestStore(provider).delete({ filter: { documentId: id } });
      } catch {
        // ignore
      }
    }

    await removeDocument(id);
    await deleteDocumentContent(id);

    return NextResponse.json({ id });
  } catch (error) {
    const { body, status } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}
