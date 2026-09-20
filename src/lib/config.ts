export type LlmProvider = "ollama" | "gemini";

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

  chromaUrl: string;
  // Separate collections per provider: Ollama's and Gemini's embedding
  // models produce differently-sized vectors, so they can't share a Chroma
  // collection - switching providers means searching a different index,
  // seeded separately.
  chromaCollectionOllama: string;
  chromaCollectionGemini: string;
  maxUploadBytes: number;
}

let cached: AppConfig | null = null;

function normalizeProvider(value: string | undefined): LlmProvider {
  return value === "gemini" ? "gemini" : "ollama";
}

export function collectionNameFor(config: AppConfig, provider: LlmProvider): string {
  return provider === "gemini" ? config.chromaCollectionGemini : config.chromaCollectionOllama;
}

// No API key required up front - Ollama runs locally with nothing to
// validate, and Gemini's key (if used) is only checked when a request
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

    chromaUrl: process.env.CHROMA_URL || "http://localhost:8000",
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
