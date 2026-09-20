import { GoogleGenAI } from "@google/genai";
import { Embeddings } from "@langchain/core/embeddings";
import { AppError } from "@/lib/errors";
import { isAuthOrBadRequestError, isRateLimitError, isServiceUnavailableError, withRetry } from "./retry";

// Free-tier friendly: small batches, sequential (not parallel), with a short
// pause between batches, all wrapped in retry/backoff.
const BATCH_SIZE = 20;
const INTER_BATCH_DELAY_MS = 300;

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

interface GeminiEmbeddingsParams {
  apiKey: string;
  model: string;
  taskType: EmbeddingTaskType;
}

/**
 * Adapter implementing LangChain's `Embeddings` interface directly on top of
 * `@google/genai`. `taskType` is fixed per instance: construct one with
 * RETRIEVAL_DOCUMENT for ingestion and a separate one with RETRIEVAL_QUERY
 * for querying, both backed by the same Chroma collection - asymmetric
 * embeddings measurably improve retrieval quality for Gemini's embedding
 * models.
 */
export class GeminiEmbeddings extends Embeddings {
  private ai: GoogleGenAI;
  private model: string;
  private taskType: EmbeddingTaskType;

  constructor(params: GeminiEmbeddingsParams) {
    super({});
    this.ai = new GoogleGenAI({ apiKey: params.apiKey });
    this.model = params.model;
    this.taskType = params.taskType;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      results.push(...(await this.embedBatch(batch)));
      if (i + BATCH_SIZE < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
      }
    }
    return results;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await withRetry(() =>
        this.ai.models.embedContent({
          model: this.model,
          contents: texts,
          config: { taskType: this.taskType },
        })
      );

      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new AppError(
          "MODEL_API_ERROR",
          `Expected ${texts.length} embeddings from Gemini, got ${embeddings.length}.`,
          502
        );
      }

      return embeddings.map((embedding) => {
        if (!embedding.values) {
          throw new AppError("MODEL_API_ERROR", "Gemini returned an embedding with no values.", 502);
        }
        return embedding.values;
      });
    } catch (error) {
      if (error instanceof AppError) throw error;

      const message = error instanceof Error ? error.message : String(error);
      if (isRateLimitError(error)) {
        throw new AppError(
          "RATE_LIMITED",
          "Gemini free-tier rate limit hit while embedding. Please wait a moment and retry.",
          429
        );
      }
      if (isServiceUnavailableError(error)) {
        throw new AppError(
          "MODEL_UNAVAILABLE",
          "Gemini's model is temporarily overloaded (Google's free-tier flash model sees demand spikes). This was already retried automatically - please wait a few seconds and try again.",
          503
        );
      }
      if (isAuthOrBadRequestError(error)) {
        throw new AppError("MODEL_API_ERROR", `Gemini embedding request rejected: ${message}`, 502);
      }
      throw new AppError("MODEL_API_ERROR", `Gemini embedding request failed: ${message}`, 502);
    }
  }
}
