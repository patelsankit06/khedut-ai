import { ChromaClient } from "chromadb";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { GeminiEmbeddings } from "@/lib/gemini/embeddings";

let chromaClient: ChromaClient | null = null;
let ingestStore: Chroma | null = null;
let queryStore: Chroma | null = null;

function getChromaClient(): ChromaClient {
  if (!chromaClient) {
    chromaClient = new ChromaClient({ path: getConfig().chromaUrl });
  }
  return chromaClient;
}

export async function isChromaReachable(): Promise<boolean> {
  try {
    await getChromaClient().heartbeat();
    return true;
  } catch {
    return false;
  }
}

/** Vector store used at ingestion time - embeds with taskType RETRIEVAL_DOCUMENT. */
export function getIngestStore(): Chroma {
  if (!ingestStore) {
    const config = getConfig();
    ingestStore = new Chroma(
      new GeminiEmbeddings({
        apiKey: config.geminiApiKey,
        model: config.geminiEmbeddingModel,
        taskType: "RETRIEVAL_DOCUMENT",
      }),
      { url: config.chromaUrl, collectionName: config.chromaCollection }
    );
  }
  return ingestStore;
}

/** Vector store used at query time - embeds with taskType RETRIEVAL_QUERY, same collection. */
export function getQueryStore(): Chroma {
  if (!queryStore) {
    const config = getConfig();
    queryStore = new Chroma(
      new GeminiEmbeddings({
        apiKey: config.geminiApiKey,
        model: config.geminiEmbeddingModel,
        taskType: "RETRIEVAL_QUERY",
      }),
      { url: config.chromaUrl, collectionName: config.chromaCollection }
    );
  }
  return queryStore;
}

export function toVectorStoreError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(
    "VECTOR_STORE_UNAVAILABLE",
    `Could not reach the vector database at ${getConfig().chromaUrl}. Is 'docker compose up' (or 'docker-compose up') running? (${message})`,
    503
  );
}
