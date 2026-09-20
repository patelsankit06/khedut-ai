import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/dataDir";

const CONTENT_DIR = path.join(dataDir(), "documents");

function contentPath(id: string): string {
  return path.join(CONTENT_DIR, `${id}.txt`);
}

export async function saveDocumentContent(id: string, content: string): Promise<void> {
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  await fs.writeFile(contentPath(id), content, "utf8");
}

export async function readDocumentContent(id: string): Promise<string | null> {
  try {
    return await fs.readFile(contentPath(id), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteDocumentContent(id: string): Promise<void> {
  try {
    await fs.unlink(contentPath(id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
