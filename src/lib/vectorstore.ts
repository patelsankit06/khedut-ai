import { ChromaClient, CloudClient } from "chromadb";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { getConfig, collectionNameFor, embeddingProviderFor, type LlmProvider } from "@/lib/config";
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

export function isGroqConfigured(): boolean {
  return Boolean(getConfig().groqApiKey);
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

// Ollama's embedding model is symmetric (no separate query/document taskType
// like Gemini's), so ingest and query share one instance/store per provider
// for Ollama, but Gemini needs two differently-configured embeddings
// instances (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY) pointed at the same
// collection - see src/lib/gemini/embeddings.ts. Cached by *embedding*
// provider (not LlmProvider) since Groq has no embeddings of its own and
// shares Gemini's store entirely - see embeddingProviderFor() in config.ts.
const ingestStores = new Map<string, Chroma>();
const queryStores = new Map<string, Chroma>();

export function getIngestStore(provider: LlmProvider): Chroma {
  const embeddingProvider = embeddingProviderFor(provider);
  let store = ingestStores.get(embeddingProvider);
  if (!store) {
    const config = getConfig();
    const embeddings =
      embeddingProvider === "gemini"
        ? new GeminiEmbeddings({ apiKey: requireGeminiApiKey(), model: config.geminiEmbeddingModel, taskType: "RETRIEVAL_DOCUMENT" })
        : new OllamaEmbeddings({ baseUrl: config.ollamaUrl, model: config.ollamaEmbeddingModel });
    // Pass our own already-correct client (index) rather than re-deriving
    // connection args - @langchain/community's Chroma wrapper only uses its
    // `chromaCloudAPIKey`/`clientParams` options to add an auth header, then
    // still builds its own plain ChromaClient({path: this.url}), silently
    // defaulting to localhost:8000 when no `url` is given. Passing `index`
    // bypasses that entirely.
    store = new Chroma(embeddings, { index: getChromaClient(), collectionName: collectionNameFor(config, provider) });
    ingestStores.set(embeddingProvider, store);
  }
  return store;
}

export function getQueryStore(provider: LlmProvider): Chroma {
  const embeddingProvider = embeddingProviderFor(provider);
  let store = queryStores.get(embeddingProvider);
  if (!store) {
    const config = getConfig();
    const embeddings =
      embeddingProvider === "gemini"
        ? new GeminiEmbeddings({ apiKey: requireGeminiApiKey(), model: config.geminiEmbeddingModel, taskType: "RETRIEVAL_QUERY" })
        : new OllamaEmbeddings({ baseUrl: config.ollamaUrl, model: config.ollamaEmbeddingModel });
    store = new Chroma(embeddings, { index: getChromaClient(), collectionName: collectionNameFor(config, provider) });
    queryStores.set(embeddingProvider, store);
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
