import { Document } from "@langchain/core/documents";
import { PDFParse } from "pdf-parse";
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
    case "pdf": {
      // Calling pdf-parse's v2 API directly (statically imported above)
      // rather than going through @langchain/community's PDFLoader, which
      // resolves pdf-parse via a dynamic import() with a version-fallback
      // dance for a legacy v1 build path that doesn't exist in the v2 we
      // have installed. That dynamic resolution works locally (full
      // node_modules on disk) but silently fails on Vercel, where only
      // statically-imported files are reliably included in the deployed
      // function - see the "PDF uploads failing on Vercel" fix history.
      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      docs = result.pages.map(
        (page) => new Document({ pageContent: page.text, metadata: { loc: { pageNumber: page.num } } })
      );
      break;
    }
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
