import { promises as fs } from "fs";
import path from "path";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const KB_DIR = path.join(process.cwd(), "data", "knowledge-base");
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

// Each knowledge-base file is a crop guide: a small frontmatter header
// (crop, source) followed by `## Category` sections. Splitting on headings
// (rather than a blind character splitter) means every chunk inherits a
// meaningful `category` for filtering/citations, at the cost of assuming
// authors keep sections reasonably sized.
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
    meta[key] = value;
  }
  return { meta, body: match[2] };
}

function splitSections(body: string): { category: string; content: string }[] {
  const sections: { category: string; content: string }[] = [];
  for (const part of body.split(/\n(?=## )/g)) {
    const trimmed = part.trim();
    const headingMatch = trimmed.match(/^##\s+(.+)/);
    if (!headingMatch) continue; // skip any preamble before the first heading
    const content = trimmed.slice(headingMatch[0].length).trim();
    if (content) sections.push({ category: headingMatch[1].trim(), content });
  }
  return sections;
}

export function knowledgeBaseDocumentId(crop: string): string {
  return `kb:${crop}`;
}

export async function loadKnowledgeBaseChunks(): Promise<Document[]> {
  let filenames: string[];
  try {
    filenames = (await fs.readdir(KB_DIR)).filter((name) => name.endsWith(".md"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const chunks: Document[] = [];

  for (const filename of filenames) {
    const raw = await fs.readFile(path.join(KB_DIR, filename), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const crop = meta.crop ?? path.basename(filename, ".md");
    const source = meta.source ?? filename;
    const documentId = knowledgeBaseDocumentId(crop);

    let chunkIndex = 0;
    for (const section of splitSections(body)) {
      const pieces =
        section.content.length > CHUNK_SIZE ? await splitter.splitText(section.content) : [section.content];

      for (const piece of pieces) {
        chunks.push(
          new Document({
            pageContent: piece,
            metadata: {
              crop,
              category: section.category,
              source,
              documentId,
              chunkIndex,
              id: `${documentId}:${chunkIndex}`,
            },
          })
        );
        chunkIndex += 1;
      }
    }
  }

  return chunks;
}
