import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { AppError } from "@/lib/errors";
import { getExtension } from "./types";

export async function loadDocument(file: File, originalFilename: string): Promise<Document[]> {
  const extension = getExtension(originalFilename);

  if (extension === "doc") {
    throw new AppError(
      "UNSUPPORTED_FILE_TYPE",
      "Only the modern .docx format is supported, not the legacy .doc format.",
      400
    );
  }

  let docs: Document[];
  switch (extension) {
    case "pdf":
      docs = await new PDFLoader(file).load();
      break;
    case "docx":
      docs = await new DocxLoader(file, { type: "docx" }).load();
      break;
    case "txt":
    case "md":
    case "markdown":
      docs = await new TextLoader(file).load();
      break;
    default:
      throw new AppError(
        "UNSUPPORTED_FILE_TYPE",
        `Unsupported file type "${extension ? `.${extension}` : "(none)"}". Only PDF, DOCX, TXT, and Markdown files are supported.`,
        400
      );
  }

  // LangChain's fs loaders default metadata.source to "blob" when given a
  // Blob/File instead of a path - patch in the real filename for citations.
  // Also flatten to just {source, page}: PDFLoader attaches nested objects
  // (metadata.pdf, metadata.loc) that Chroma's flat metadata schema rejects.
  for (const doc of docs) {
    const pageNumber = doc.metadata.loc?.pageNumber;
    doc.metadata = {
      source: originalFilename,
      ...(typeof pageNumber === "number" ? { page: pageNumber } : {}),
    };
  }

  const combinedText = docs.map((doc) => doc.pageContent).join("").trim();
  if (!combinedText) {
    throw new AppError(
      "EMPTY_DOCUMENT",
      `"${originalFilename}" has no extractable text (it may be a scanned or image-only document).`,
      422
    );
  }

  return docs;
}
