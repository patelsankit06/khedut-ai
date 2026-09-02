import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getExtension, isMarkdownExtension } from "@/lib/parsing/types";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

export interface ChunkOptions {
  uploadId: string;
  filename: string;
}

export async function chunkDocuments(docs: Document[], options: ChunkOptions): Promise<Document[]> {
  const extension = getExtension(options.filename);
  const splitter = isMarkdownExtension(extension)
    ? RecursiveCharacterTextSplitter.fromLanguage("markdown", {
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      })
    : new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });

  // splitDocuments (not splitText) so each chunk inherits its source Document's metadata.
  const chunks = await splitter.splitDocuments(docs);

  chunks.forEach((chunk, index) => {
    chunk.metadata.documentId = options.uploadId;
    chunk.metadata.chunkIndex = index;
    chunk.metadata.id = `${options.uploadId}:${index}`;
  });

  return chunks;
}
