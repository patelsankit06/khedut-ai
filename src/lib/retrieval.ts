import { Document } from "@langchain/core/documents";
import { getQueryStore, toVectorStoreError } from "@/lib/vectorstore";

export interface Citation {
  n: number;
  source: string;
  page?: number;
  score: number;
}

export interface RetrievalResult {
  citations: Citation[];
  contextBlock: string;
}

const TOP_K = 4;

export async function retrieve(question: string): Promise<RetrievalResult> {
  let results: [Document, number][];
  try {
    results = await getQueryStore().similaritySearchWithScore(question, TOP_K);
  } catch (error) {
    throw toVectorStoreError(error);
  }

  const citations: Citation[] = results.map(([doc, score], index) => ({
    n: index + 1,
    source: String(doc.metadata.source ?? "unknown"),
    page: typeof doc.metadata.page === "number" ? doc.metadata.page : undefined,
    score,
  }));

  const contextBlock = results
    .map(([doc], index) => {
      const citation = citations[index];
      const pageSuffix = citation.page !== undefined ? `, p.${citation.page}` : "";
      return `[${citation.n}] (${citation.source}${pageSuffix}): "${doc.pageContent}"`;
    })
    .join("\n\n");

  return { citations, contextBlock };
}

export const SYSTEM_INSTRUCTION = `You are a helpful assistant answering questions using ONLY the numbered context excerpts the user provides.
Rules:
- Only use information found in the context. Do not use outside knowledge.
- Cite the sources you used inline with their bracketed number, e.g. [1] or [1][2].
- If the context does not contain enough information to answer, say "I don't know based on the provided documents." Do not guess.`;

export function buildPrompt(question: string, contextBlock: string): string {
  return `Context:\n${contextBlock}\n\nQuestion: ${question}`;
}
