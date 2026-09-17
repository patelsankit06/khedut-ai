import { ChromaClient } from "chromadb";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { OllamaEmbeddings } from "@/lib/ollama/embeddings";

let chromaClient: ChromaClient | null = null;
let vectorStore: Chroma | null = null;

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

export async function isOllamaReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${getConfig().ollamaUrl}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

// Ollama's embedding models are symmetric (no separate query/document
// taskType like Gemini's), so a single store/embeddings instance covers
// both ingestion and querying.
function getVectorStore(): Chroma {
  if (!vectorStore) {
    const config = getConfig();
    vectorStore = new Chroma(
      new OllamaEmbeddings({ baseUrl: config.ollamaUrl, model: config.ollamaEmbeddingModel }),
      { url: config.chromaUrl, collectionName: config.chromaCollection }
    );
  }
  return vectorStore;
}

export function getIngestStore(): Chroma {
  return getVectorStore();
}

export function getQueryStore(): Chroma {
  return getVectorStore();
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
