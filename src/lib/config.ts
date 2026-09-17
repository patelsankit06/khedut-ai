export interface AppConfig {
  ollamaUrl: string;
  ollamaChatModel: string;
  ollamaEmbeddingModel: string;
  chromaUrl: string;
  chromaCollection: string;
  maxUploadBytes: number;
}

let cached: AppConfig | null = null;

// No API key required - Ollama runs locally, so there's nothing to validate
// up front. Still lazy (not at module load) for consistency with how routes
// are inspected during `next build`.
export function getConfig(): AppConfig {
  if (cached) return cached;

  cached = {
    ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || "llama3.2",
    ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
    chromaUrl: process.env.CHROMA_URL || "http://localhost:8000",
    // Distinct from the old Gemini-backed collection name: Ollama's
    // embedding model has a different vector dimensionality, so it needs
    // its own Chroma collection rather than reusing/mixing with old vectors.
    chromaCollection: process.env.CHROMA_COLLECTION || "khedut_chunks_ollama",
    maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || "20") * 1024 * 1024,
  };
  return cached;
}
