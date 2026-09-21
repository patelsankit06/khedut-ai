import { Document } from "@langchain/core/documents";
import type { Chroma } from "@langchain/community/vectorstores/chroma";
import { embeddingProviderFor, type LlmProvider, type EmbeddingProvider } from "@/lib/config";
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
// opposite) - lower is more similar. Calibrated empirically for
// nomic-embed-text (Ollama): on-topic matches for this knowledge base score
// well under 0.75, while off-topic trivia scores 1.05+ even for the
// "closest" chunk, since nearest-neighbor search always returns *something*.
// Chunks past this threshold are dropped so unrelated questions don't
// surface misleading citations. Calibrated per provider, since each
// embedding model separates topics by a different margin: gemini-embedding-001
// (hosted, larger) separates more sharply than nomic-embed-text (local/small)
// - on-topic well under 0.65, off-topic 0.82+. Re-calibrate a provider's
// entry if its embedding model changes.
const MAX_RELEVANT_DISTANCE: Record<EmbeddingProvider, number> = {
  ollama: 1.0,
  gemini: 0.8,
};

// nomic-embed-text doesn't separate "meta questions about the assistant"
// from generic off-topic trivia as sharply as a larger hosted embedding
// model would - both score similarly far from farming content (observed
// ~1.05-1.08 for genuine "what do you do?" matches against the About doc
// itself, overlapping with off-topic trivia's ~1.08-1.2), so the distance
// threshold alone can't reliably tell them apart. Meta questions are instead
// routed straight at the "About Khedut AI" doc (crop: "general"), bypassing
// both the crop filter and the relevance threshold. Keep this pattern broad
// - it's the only thing standing between a real phrasing and a confusing
// "no matching information" reply, so favor more variants over precision.
const META_QUESTION_PATTERN =
  /\b(what (do|can|)\s*you do|who are you|what are you|what is khedut|about khedut|your capabilit|what can i ask|what.*questions.*(can i )?ask|how (do|can) i use (this|you|khedut)|introduce yourself|what.*(this (app|bot|chatbot|assistant)))\b/i;

// Same problem as meta-questions, different trigger: asking about an
// uploaded file ("what's in the pdf I just uploaded?") has no farming
// content of its own to match against semantically, so it can score worse
// than the actual uploaded document and fall through to general chat -
// which then has nothing real to say and may hallucinate from unrelated
// conversation history (observed: claimed an uploaded cotton PDF was about
// pomegranate, because pomegranate was discussed earlier in the chat).
// Bypasses the same way: search crop:"general" (where uploads live)
// without the relevance threshold, so the real uploaded content - which
// should still out-rank the About doc for anything document-shaped - wins.
const UPLOADED_DOC_QUESTION_PATTERN =
  /\b(pdf|document|file)s?\b.*\b(contain|inside|about|say|receive|attach)|\b(receive|got|upload(ed)?)\b.*\b(pdf|document|file)s?\b/i;

// Chunks are always tagged with a `crop` (a specific crop, or "general" for
// documents uploaded without a crop). Filtering by a selected crop still
// includes "general" chunks so uploaded reference material stays searchable
// regardless of which crop the farmer picked.
function buildCropFilter(crop?: string): CropFilter | undefined {
  if (!crop) return undefined;
  return { $or: [{ crop }, { crop: "general" }] };
}

export async function retrieve(question: string, crop: string | undefined, provider: LlmProvider): Promise<RetrievalResult> {
  const isMetaQuestion = META_QUESTION_PATTERN.test(question);
  const isDocumentQuestion = UPLOADED_DOC_QUESTION_PATTERN.test(question);
  const bypassThreshold = isMetaQuestion || isDocumentQuestion;
  const filter: CropFilter | undefined = bypassThreshold ? { crop: "general" } : buildCropFilter(crop);

  let rawResults: [Document, number][];
  try {
    rawResults = await getQueryStore(provider).similaritySearchWithScore(question, TOP_K, filter);
  } catch (error) {
    throw toVectorStoreError(error);
  }

  const maxDistance = MAX_RELEVANT_DISTANCE[embeddingProviderFor(provider)];
  const results = bypassThreshold ? rawResults : rawResults.filter(([, score]) => score <= maxDistance);

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

export const SYSTEM_INSTRUCTION = `You are Khedut AI, a helpful farming assistant. You have access to a curated agriculture knowledge base covering pomegranate, tomato, wheat, cotton, and potato (crop stages, soil, irrigation, fertilizers, diseases, pests, harvesting).
Rules:
- Some messages below include numbered context excerpts from the knowledge base. When they're present, ground your answer in them and cite the sources you used inline with their bracketed number, e.g. [1] or [1][2].
- When a message has no context excerpts (the knowledge base didn't have a specific match, it's a general or follow-up question, or small talk), just answer normally and helpfully using your own knowledge and the conversation so far - don't refuse and don't claim you have no information. Never invent a bracketed citation when no context was given.
- Use the conversation history to understand follow-ups like "yes", "tell me more", or "what about tomato instead?".
- Never name a specific pesticide, fungicide, or fertilizer brand/dosage for a farming question unless a context excerpt explicitly and specifically states it. Otherwise, describe the general approach and recommend consulting a local agricultural expert before applying any chemical.
- When discussing symptoms that could indicate a plant disease or pest, present them as "possible causes" rather than a definitive diagnosis, and suggest practical next steps (inspection, isolation of affected plants, expert consultation).
- Keep answers concise and practical, using bullet points for symptoms, causes, or steps when it improves clarity.`;

export function buildPrompt(question: string, contextBlock: string, crop?: string): string {
  const cropLine = crop ? `The farmer's selected crop is: ${crop}.\n\n` : "";
  if (!contextBlock) {
    return `${cropLine}Question: ${question}\n\n(No matching knowledge base excerpts for this one - answer from your own knowledge or the conversation history.)`;
  }
  return `${cropLine}Context:\n${contextBlock}\n\nQuestion: ${question}`;
}
