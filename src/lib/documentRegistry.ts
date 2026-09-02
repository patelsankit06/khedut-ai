import { promises as fs } from "fs";
import path from "path";

const REGISTRY_PATH = path.join(process.cwd(), "data", "registry.json");

export interface DocumentRecord {
  id: string;
  filename: string;
  uploadedAt: string;
  chunkCount: number;
}

async function readRegistry(): Promise<DocumentRecord[]> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf8");
    return JSON.parse(raw) as DocumentRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeRegistry(records: DocumentRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(REGISTRY_PATH), { recursive: true });
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(records, null, 2), "utf8");
}

export function listDocuments(): Promise<DocumentRecord[]> {
  return readRegistry();
}

// Serialized with an in-process queue so concurrent uploads don't clobber each
// other's writes. Good enough for a single-user local demo, not a real DB.
let writeQueue: Promise<void> = Promise.resolve();

// Upserts by id: re-uploading the same filename (same derived id) replaces
// its existing entry instead of adding a duplicate row.
export function addDocument(record: DocumentRecord): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const records = await readRegistry();
    const withoutExisting = records.filter((existing) => existing.id !== record.id);
    withoutExisting.push(record);
    await writeRegistry(withoutExisting);
  });
  return writeQueue;
}

export function removeDocument(id: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const records = await readRegistry();
    await writeRegistry(records.filter((existing) => existing.id !== id));
  });
  return writeQueue;
}
