# RAG Chatbot

An end-to-end Retrieval-Augmented Generation chatbot: upload documents, ask questions, get answers grounded in — and cited to — what you uploaded.

**Pipeline:** upload → parse (PDF/DOCX/TXT/Markdown) → chunk → embed → store in Chroma → retrieve top-K on a question → generate a cited, streamed answer.

## Architecture

```
Ingest:  File -> loadDocument() [LangChain loaders] -> chunkDocuments() [RecursiveCharacterTextSplitter]
         -> GeminiEmbeddings.embedDocuments() [@google/genai, batched] -> Chroma upsert

Chat:    Question -> GeminiEmbeddings.embedQuery() -> Chroma similaritySearchWithScore(k=4)
         -> grounded prompt with numbered citations -> Gemini streamed generation -> cited answer
```

- **Stack:** Next.js (App Router) + TypeScript, single codebase for API and UI.
- **Parsing/chunking/vector store plumbing:** LangChain.js (`@langchain/community` document loaders, `@langchain/textsplitters`, the `Chroma` vector store integration).
- **Embeddings + chat generation:** called directly via `@google/genai`, not `@langchain/google-genai` — that package still depends on Google's deprecated `@google/generative-ai` SDK. A small adapter (`src/lib/gemini/embeddings.ts`) implements LangChain's `Embeddings` interface on top of `@google/genai`, so it still plugs directly into the Chroma vector store.
- **Vector store:** [Chroma](https://www.trychroma.com/), run via Docker. Chroma's JS client is a REST client only — there's no in-process/embedded mode for Node — so Chroma runs as its own container.
- **Retrieval + generation:** a direct `similaritySearchWithScore` call and a hand-built prompt, not a LangChain chain abstraction — keeps every intermediate step (what got retrieved, what the exact prompt was) visible and debuggable.

## Prerequisites

- Node.js 20+
- Docker (either the `docker compose` v2 plugin or the standalone `docker-compose` v1 binary)
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Setup

```bash
cp .env.local.example .env.local   # already done in this repo — just fill in GEMINI_API_KEY
docker compose up -d               # or: docker-compose up -d
npm install
npm run dev
```

Confirm Chroma is up: `curl http://localhost:8000/api/v2/heartbeat` (the compose file has no built-in healthcheck — the `chromadb/chroma` image ships no curl/wget/python to probe itself with).

If you ever edit `docker-compose.yml` and the container fails to recreate with a `KeyError: 'ContainerConfig'`, that's a known incompatibility between the older standalone `docker-compose` v1 binary and this image's manifest format — run `docker-compose down && docker-compose up -d` instead of relying on in-place recreation.

Open http://localhost:3000. The header shows live Chroma/Gemini status pills.

## Demo script

1. Upload a PDF and a Markdown file via the sidebar.
2. Ask a question answerable from just one of them — the streamed answer cites the correct filename (and page, for the PDF).
3. Ask a question that spans both documents — multiple citations appear.
4. Ask something unrelated to either document — the model says it doesn't know rather than guessing.
5. Stop Chroma (`docker compose stop`) and ask another question — the UI shows a clear "vector database unreachable" error instead of crashing.
6. Re-upload the same file — the chunk count in the sidebar doesn't double (upserts by deterministic chunk id, not inserts).

## Configuration

All in `.env.local`:

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | required |
| `GEMINI_CHAT_MODEL` | `gemini-flash-latest` | rolling alias to Google's current free-tier flash model; pin a dated id for reproducible answers |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | see the comment in `src/lib/gemini/embeddings.ts` before switching to `gemini-embedding-2` — its batching/task-type semantics differ |
| `CHROMA_URL` | `http://localhost:8000` | |
| `CHROMA_COLLECTION` | `rag_chunks` | single shared collection across all uploads |
| `MAX_UPLOAD_MB` | `20` | |

## Known limitations

- Single shared Chroma collection — no per-user isolation or auth (fine for a local demo; a `documentId` filter is already on every chunk if per-document scoping is ever needed).
- Gemini free-tier rate limits apply; rapid-fire questions may hit a 429 (surfaced in the UI, not a raw stack trace).
- Model ids drift over time — both model names are env vars for exactly this reason.
- `data/registry.json` is a flat file, not a database — fine for a single-user local demo, not for concurrent multi-user use.
