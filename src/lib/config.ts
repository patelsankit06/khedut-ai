export interface AppConfig {
  geminiApiKey: string;
  geminiChatModel: string;
  geminiEmbeddingModel: string;
  chromaUrl: string;
  chromaCollection: string;
  maxUploadBytes: number;
}

let cached: AppConfig | null = null;

// Validated lazily (not at module load) so `next build` - which imports route
// modules to inspect their exports - doesn't fail when env vars aren't set yet.
export function getConfig(): AppConfig {
  if (cached) return cached;

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Copy .env.local.example to .env.local and set it (get a free key at https://aistudio.google.com/apikey)."
    );
  }

  cached = {
    geminiApiKey,
    geminiChatModel: process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest",
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
    chromaUrl: process.env.CHROMA_URL || "http://localhost:8000",
    chromaCollection: process.env.CHROMA_COLLECTION || "khedu_chunks",
    maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || "20") * 1024 * 1024,
  };
  return cached;
}
