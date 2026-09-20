import { Document } from "@langchain/core/documents";
import pdfParse from "pdf-parse";
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
      // pdf-parse v1, deliberately: v2 pulls in pdfjs-dist + @napi-rs/canvas
      // (native bindings), which broke in ways that were hard to diagnose on
      // Vercel (its runtime-log API was scope-restricted for this account,
      // so we couldn't see the real error - a temporary diagnostic build
      // showed the swallowed "Failed to load pdf-parse" message, then after
      // switching to a static import, an outright uncaught crash with no
      // response body, consistent with a module failing to link at all on
      // Vercel's Lambda). v1 has effectively no dependencies (a single
      // bundled pdf.js, no native code) and is the long-standing, widely
      // deployed choice for exactly this environment - see the "PDF uploads
      // failing on Vercel" fix history for the full story.
      const buffer = Buffer.from(await file.arrayBuffer());
      const pages: { text: string; num: number }[] = [];
      await pdfParse(buffer, {
        pagerender: async (pageData) => {
          const textContent = await pageData.getTextContent();
          const text = textContent.items.map((item: { str: string }) => item.str).join(" ");
          pages.push({ text, num: pageData.pageNumber });
          return text;
        },
      });
      docs = pages.map((page) => new Document({ pageContent: page.text, metadata: { loc: { pageNumber: page.num } } }));
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
