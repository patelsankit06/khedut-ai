import { ChromaClient, CloudClient } from "chromadb";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { getConfig, collectionNameFor, type AppConfig, type LlmProvider } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { OllamaEmbeddings } from "@/lib/ollama/embeddings";
import { GeminiEmbeddings } from "@/lib/gemini/embeddings";

let chromaClient: ChromaClient | null = null;

// Chroma Cloud (managed) is used whenever CHROMA_API_KEY is set - needed for
// hosts like Vercel that can't run the self-hosted Docker container
// themselves. Otherwise this is a self-hosted instance (local Docker, or any
// remotely-reachable one) addressed by chromaUrl alone.
function getChromaClient(): ChromaClient {
  if (!chromaClient) {
    const config = getConfig();
    chromaClient = config.chromaApiKey
      ? new CloudClient({ apiKey: config.chromaApiKey, tenant: config.chromaTenant, database: config.chromaDatabase })
      : new ChromaClient({ path: config.chromaUrl });
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

export function isGeminiConfigured(): boolean {
  return Boolean(getConfig().geminiApiKey);
}

function requireGeminiApiKey(): string {
  const apiKey = getConfig().geminiApiKey;
  if (!apiKey) {
    throw new AppError(
      "MODEL_UNAVAILABLE",
      "GEMINI_API_KEY is not set. Add it to .env.local to use the Gemini provider.",
      503
    );
  }
  return apiKey;
}

// Same Chroma Cloud vs. self-hosted branch as getChromaClient() above, but
// expressed as constructor args for @langchain/community's Chroma wrapper
// (which builds its own ChromaClient internally rather than accepting one).
function chromaConnectionArgs(config: AppConfig) {
  return config.chromaApiKey
    ? {
        chromaCloudAPIKey: config.chromaApiKey,
        clientParams: { tenant: config.chromaTenant, database: config.chromaDatabase },
      }
    : { url: config.chromaUrl };
}

// Ollama's embedding model is symmetric (no separate query/document taskType
// like Gemini's), so ingest and query share one instance/store per provider
// for Ollama, but Gemini needs two differently-configured embeddings
// instances (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY) pointed at the same
// collection - see src/lib/gemini/embeddings.ts.
const ingestStores = new Map<LlmProvider, Chroma>();
const queryStores = new Map<LlmProvider, Chroma>();

export function getIngestStore(provider: LlmProvider): Chroma {
  let store = ingestStores.get(provider);
  if (!store) {
    const config = getConfig();
    const embeddings =
      provider === "gemini"
        ? new GeminiEmbeddings({ apiKey: requireGeminiApiKey(), model: config.geminiEmbeddingModel, taskType: "RETRIEVAL_DOCUMENT" })
        : new OllamaEmbeddings({ baseUrl: config.ollamaUrl, model: config.ollamaEmbeddingModel });
    store = new Chroma(embeddings, { ...chromaConnectionArgs(config), collectionName: collectionNameFor(config, provider) });
    ingestStores.set(provider, store);
  }
  return store;
}

export function getQueryStore(provider: LlmProvider): Chroma {
  let store = queryStores.get(provider);
  if (!store) {
    const config = getConfig();
    const embeddings =
      provider === "gemini"
        ? new GeminiEmbeddings({ apiKey: requireGeminiApiKey(), model: config.geminiEmbeddingModel, taskType: "RETRIEVAL_QUERY" })
        : new OllamaEmbeddings({ baseUrl: config.ollamaUrl, model: config.ollamaEmbeddingModel });
    store = new Chroma(embeddings, { ...chromaConnectionArgs(config), collectionName: collectionNameFor(config, provider) });
    queryStores.set(provider, store);
  }
  return store;
}

export function toVectorStoreError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const config = getConfig();
  const target = config.chromaApiKey ? "Chroma Cloud" : `the vector database at ${config.chromaUrl}`;
  return new AppError(
    "VECTOR_STORE_UNAVAILABLE",
    `Could not reach ${target}. ${config.chromaApiKey ? "Check CHROMA_API_KEY/CHROMA_TENANT/CHROMA_DATABASE." : "Is 'docker compose up' (or 'docker-compose up') running?"} (${message})`,
    503
  );
}
