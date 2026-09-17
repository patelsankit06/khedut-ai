import { promises as fs } from "fs";
import path from "path";

const STATUS_PATH = path.join(process.cwd(), "data", "kb-status.json");

export interface KnowledgeBaseStatus {
  seededAt: string;
  totalChunks: number;
  perCrop: Record<string, number>;
}

export async function readKnowledgeBaseStatus(): Promise<KnowledgeBaseStatus | null> {
  try {
    const raw = await fs.readFile(STATUS_PATH, "utf8");
    return JSON.parse(raw) as KnowledgeBaseStatus;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeKnowledgeBaseStatus(status: KnowledgeBaseStatus): Promise<void> {
  await fs.mkdir(path.dirname(STATUS_PATH), { recursive: true });
  await fs.writeFile(STATUS_PATH, JSON.stringify(status, null, 2), "utf8");
}
