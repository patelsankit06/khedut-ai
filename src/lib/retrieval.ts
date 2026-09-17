import { Document } from "@langchain/core/documents";
import type { Chroma } from "@langchain/community/vectorstores/chroma";
import { getQueryStore, toVectorStoreError } from "@/lib/vectorstore";

type CropFilter = Chroma["FilterType"];

export interface Citation {
  n: number;
  source: string;
  page?: number;
  crop?: string;
  category?: string;
  score: number;
}

export interface RetrievalResult {
  citations: Citation[];
  contextBlock: string;
}

const TOP_K = 4;

// Chroma's distance score here is cosine distance (0 = identical, 2 =
// opposite) - lower is more similar. Empirically, on-topic matches for this
// knowledge base score well under 0.65, while off-topic questions (small
// talk, unrelated trivia) score 0.8+ even for the "closest" chunk, since
// nearest-neighbor search always returns *something*. Chunks past this
// threshold are dropped so unrelated questions don't surface misleading
// citations - see the "About Khedu AI" doc in data/knowledge-base for how
// meta-questions ("what can you do?") are answered from the KB itself
// instead of falling through this cutoff.
const MAX_RELEVANT_DISTANCE = 0.8;

// Chunks are always tagged with a `crop` (a specific crop, or "general" for
// documents uploaded without a crop). Filtering by a selected crop still
// includes "general" chunks so uploaded reference material stays searchable
// regardless of which crop the farmer picked.
function buildCropFilter(crop?: string): CropFilter | undefined {
  if (!crop) return undefined;
  return { $or: [{ crop }, { crop: "general" }] };
}

export async function retrieve(question: string, crop?: string): Promise<RetrievalResult> {
  let rawResults: [Document, number][];
  try {
    rawResults = await getQueryStore().similaritySearchWithScore(question, TOP_K, buildCropFilter(crop));
  } catch (error) {
    throw toVectorStoreError(error);
  }

  const results = rawResults.filter(([, score]) => score <= MAX_RELEVANT_DISTANCE);

  const citations: Citation[] = results.map(([doc, score], index) => ({
    n: index + 1,
    source: String(doc.metadata.source ?? "unknown"),
    page: typeof doc.metadata.page === "number" ? doc.metadata.page : undefined,
    crop:
      typeof doc.metadata.crop === "string" && doc.metadata.crop !== "general" ? doc.metadata.crop : undefined,
    category: typeof doc.metadata.category === "string" ? doc.metadata.category : undefined,
    score,
  }));

  const contextBlock = results
    .map(([doc], index) => {
      const citation = citations[index];
      const pageSuffix = citation.page !== undefined ? `, p.${citation.page}` : "";
      const categorySuffix = citation.category ? `, ${citation.category}` : "";
      return `[${citation.n}] (${citation.source}${categorySuffix}${pageSuffix}): "${doc.pageContent}"`;
    })
    .join("\n\n");

  return { citations, contextBlock };
}

export const SYSTEM_INSTRUCTION = `You are Khedu AI, a friendly agricultural assistant that helps farmers with crop stages, soil, irrigation, fertilizers, nutrient deficiencies, diseases, and pest management.
Rules:
- Only use information found in the numbered context excerpts the user provides. Do not use outside general knowledge.
- Cite the sources you used inline with their bracketed number, e.g. [1] or [1][2].
- If the context does not contain enough information to answer, say "I don't have enough information in the knowledge base to answer that confidently - please consult your local agricultural extension office." Do not guess.
- Never name a specific pesticide, fungicide, or fertilizer brand/dosage unless the context excerpt explicitly and specifically states it for this exact situation. Otherwise, describe the general category or approach and recommend the farmer consult a local agricultural expert before applying any chemical.
- When discussing symptoms that could indicate a disease or pest, present them as "possible causes" rather than a definitive diagnosis, and suggest practical next steps (inspection, isolation of affected plants, expert consultation).
- Keep answers practical and use bullet points for symptoms, causes, or steps when it improves clarity.`;

export function buildPrompt(question: string, contextBlock: string, crop?: string): string {
  const cropLine = crop ? `The farmer's selected crop is: ${crop}.\n\n` : "";
  return `${cropLine}Context:\n${contextBlock}\n\nQuestion: ${question}`;
}
