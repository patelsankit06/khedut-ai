import { promises as fs } from "fs";
import path from "path";
import { embeddingProviderFor, type LlmProvider, type EmbeddingProvider } from "@/lib/config";
import { dataDir } from "@/lib/dataDir";

const STATUS_PATH = path.join(dataDir(), "kb-status.json");

export interface KnowledgeBaseStatus {
  seededAt: string;
  totalChunks: number;
  perCrop: Record<string, number>;
}

// Keyed by *embedding* provider, not LlmProvider: Ollama and Gemini are
// seeded into separate Chroma collections (see collectionNameFor in
// src/lib/config.ts) so each has its own independent seed status, but Groq
// has no embeddings of its own and shares Gemini's collection entirely - so
// "groq" and "gemini" resolve to the same status entry here too.
type StatusFile = Partial<Record<EmbeddingProvider, KnowledgeBaseStatus>>;

async function readStatusFile(): Promise<StatusFile> {
  try {
    const raw = await fs.readFile(STATUS_PATH, "utf8");
    return JSON.parse(raw) as StatusFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function readKnowledgeBaseStatus(provider: LlmProvider): Promise<KnowledgeBaseStatus | null> {
  const statusFile = await readStatusFile();
  return statusFile[embeddingProviderFor(provider)] ?? null;
}

export async function writeKnowledgeBaseStatus(provider: LlmProvider, status: KnowledgeBaseStatus): Promise<void> {
  const statusFile = await readStatusFile();
  statusFile[embeddingProviderFor(provider)] = status;
  await fs.mkdir(path.dirname(STATUS_PATH), { recursive: true });
  await fs.writeFile(STATUS_PATH, JSON.stringify(statusFile, null, 2), "utf8");
}
