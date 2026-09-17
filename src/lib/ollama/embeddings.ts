import { Embeddings } from "@langchain/core/embeddings";
import { AppError } from "@/lib/errors";

interface OllamaEmbeddingsParams {
  baseUrl: string;
  model: string;
}

interface OllamaEmbedResponse {
  embeddings?: number[][];
  error?: string;
}

/**
 * Adapter implementing LangChain's `Embeddings` interface on top of Ollama's
 * `/api/embed` endpoint. Unlike Gemini's embedding model, Ollama embedding
 * models (e.g. nomic-embed-text) are symmetric - no separate query/document
 * taskType needed, so this one class covers both ingestion and querying.
 */
export class OllamaEmbeddings extends Embeddings {
  private baseUrl: string;
  private model: string;

  constructor(params: OllamaEmbeddingsParams) {
    super({});
    this.baseUrl = params.baseUrl;
    this.model = params.model;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embedBatch(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: texts }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(
        "MODEL_UNAVAILABLE",
        `Could not reach Ollama at ${this.baseUrl}. Is 'ollama serve' running? (${message})`,
        503
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw this.toApiError(text || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as OllamaEmbedResponse;
    if (data.error) throw this.toApiError(data.error);

    const embeddings = data.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new AppError(
        "MODEL_API_ERROR",
        `Expected ${texts.length} embeddings from Ollama, got ${embeddings.length}.`,
        502
      );
    }

    return embeddings;
  }

  private toApiError(message: string): AppError {
    if (/model .* not found/i.test(message)) {
      return new AppError(
        "MODEL_UNAVAILABLE",
        `Model "${this.model}" isn't pulled yet. Run: ollama pull ${this.model}`,
        503
      );
    }
    return new AppError("MODEL_API_ERROR", `Ollama embedding request failed: ${message}`, 502);
  }
}
