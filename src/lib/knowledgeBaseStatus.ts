import { promises as fs } from "fs";
import path from "path";
import type { LlmProvider } from "@/lib/config";

const STATUS_PATH = path.join(process.cwd(), "data", "kb-status.json");

export interface KnowledgeBaseStatus {
  seededAt: string;
  totalChunks: number;
  perCrop: Record<string, number>;
}

// Keyed by provider: Ollama and Gemini are seeded into separate Chroma
// collections (see collectionNameFor in src/lib/config.ts), so each has its
// own independent seed status.
type StatusFile = Partial<Record<LlmProvider, KnowledgeBaseStatus>>;

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
  return statusFile[provider] ?? null;
}

export async function writeKnowledgeBaseStatus(provider: LlmProvider, status: KnowledgeBaseStatus): Promise<void> {
  const statusFile = await readStatusFile();
  statusFile[provider] = status;
  await fs.mkdir(path.dirname(STATUS_PATH), { recursive: true });
  await fs.writeFile(STATUS_PATH, JSON.stringify(statusFile, null, 2), "utf8");
}
