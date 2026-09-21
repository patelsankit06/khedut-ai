export type LlmProvider = "ollama" | "gemini" | "groq";

// Groq has no embeddings API (chat/completion only) - see the comment on
// embeddingProviderFor() below for how "groq" is handled for retrieval.
export type EmbeddingProvider = "ollama" | "gemini";

export interface AppConfig {
  llmProvider: LlmProvider;

  ollamaUrl: string;
  ollamaChatModel: string;
  ollamaEmbeddingModel: string;

  // Optional - the app runs fine on Ollama alone. Only required when a
  // request actually selects the "gemini" provider (checked at the point of
  // use, not here, so a missing key doesn't break the Ollama-only path).
  geminiApiKey?: string;
  geminiChatModel: string;
  geminiEmbeddingModel: string;

  // Groq: chat generation only (no embeddings - see EmbeddingProvider above).
  // A fast, generous-free-tier alternative for when Gemini's chat quota is
  // exhausted; retrieval still goes through Gemini's embeddings/collection.
  groqApiKey?: string;
  groqChatModel: string;

  // Self-hosted Chroma (local Docker, or any remotely-reachable instance -
  // e.g. Railway/Render/Fly.io) is addressed by chromaUrl alone. Chroma
  // Cloud (a managed option, useful since a serverless host like Vercel
  // can't run the local Docker container itself) is used instead whenever
  // chromaApiKey is set - see getChromaClient()/getVectorStore() in
  // src/lib/vectorstore.ts for the branch.
  chromaUrl: string;
  chromaApiKey?: string;
  chromaTenant?: string;
  chromaDatabase?: string;
  // One collection per *embedding* provider (not per LlmProvider): Ollama's
  // and Gemini's embedding models produce differently-sized vectors, so they
  // can't share a Chroma collection. Groq has no embedding model of its own,
  // so it shares Gemini's - see embeddingProviderFor().
  chromaCollectionOllama: string;
  chromaCollectionGemini: string;
  maxUploadBytes: number;
}

let cached: AppConfig | null = null;

function normalizeProvider(value: string | undefined): LlmProvider {
  if (value === "gemini" || value === "groq") return value;
  return "ollama";
}

// Groq doesn't offer an embeddings API, so it can't have its own Chroma
// collection - it piggybacks on Gemini's (same collection, same embedding
// model) for retrieval, while using its own model for chat generation. This
// keeps Groq usable as a drop-in swap for Gemini's *chat* quota specifically
// (the thing that actually runs out first on a free tier) without needing a
// separate index to seed and maintain.
export function embeddingProviderFor(provider: LlmProvider): EmbeddingProvider {
  return provider === "ollama" ? "ollama" : "gemini";
}

export function collectionNameFor(config: AppConfig, provider: LlmProvider): string {
  return embeddingProviderFor(provider) === "gemini" ? config.chromaCollectionGemini : config.chromaCollectionOllama;
}

// No API key required up front - Ollama runs locally with nothing to
// validate, and Gemini/Groq's keys (if used) are only checked when a request
// actually selects that provider. Still lazy (not at module load) for
// consistency with how routes are inspected during `next build`.
export function getConfig(): AppConfig {
  if (cached) return cached;

  cached = {
    llmProvider: normalizeProvider(process.env.LLM_PROVIDER),

    ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || "llama3.2",
    ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",

    geminiApiKey: process.env.GEMINI_API_KEY || undefined,
    geminiChatModel: process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest",
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",

    groqApiKey: process.env.GROQ_API_KEY || undefined,
    groqChatModel: process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b",

    chromaUrl: process.env.CHROMA_URL || "http://localhost:8000",
    chromaApiKey: process.env.CHROMA_API_KEY || undefined,
    chromaTenant: process.env.CHROMA_TENANT || undefined,
    chromaDatabase: process.env.CHROMA_DATABASE || undefined,
    // CHROMA_COLLECTION is the old (pre-provider-toggle) variable name -
    // kept as a fallback so existing .env.local files and already-seeded
    // Ollama collections keep working without edits.
    chromaCollectionOllama:
      process.env.CHROMA_COLLECTION_OLLAMA || process.env.CHROMA_COLLECTION || "khedut_chunks_ollama",
    chromaCollectionGemini: process.env.CHROMA_COLLECTION_GEMINI || "khedut_chunks_gemini",
    maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || "20") * 1024 * 1024,
  };
  return cached;
}
