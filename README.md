# 🌱 Khedut AI — Smart Farming Assistant

A general-purpose chatbot with a domain specialty: it answers farming questions (crop stages, soil, irrigation, fertilizers, diseases, pest management) grounded in a curated agriculture knowledge base with crop filtering, and falls back to normal conversational ability - like any general AI chatbot - for everything else (general knowledge, small talk, follow-ups), using recent conversation history so it stays coherent across turns.

**Pipeline:** curated crop guides (Markdown) → split into `## `-headed sections → chunk → embed → store in Chroma with `crop`/`category` metadata → retrieve top-K, optionally filtered by selected crop → if relevant matches were found, generate an answer grounded in them; otherwise generate a normal answer from the model's own knowledge and the conversation history - streamed either way, with safety-conscious guardrails for farming chemical questions.

## Architecture

```
Seed:    data/knowledge-base/<crop>.md -> loadKnowledgeBaseChunks() [split by ## heading -> chunk]
         -> OllamaEmbeddings.embedDocuments() -> Chroma upsert (metadata: crop, category, source)

Chat:    Question (+ selected crop + recent history) -> OllamaEmbeddings.embedQuery()
         -> Chroma similaritySearchWithScore(k=4, filter: crop OR "general")
         -> grounded prompt (if relevant chunks found) -> Ollama/Gemini streamed generation -> answer
```

- **Stack:** Next.js (App Router) + TypeScript, single codebase for API and UI.
- **Knowledge base:** 5 crops (pomegranate, tomato, wheat, cotton, potato) covering crop stages, soil, irrigation, fertilizers/nutrients, diseases, pests, and harvesting. Pomegranate is the primary/most detailed crop. There's also a `general`-crop "About Khedut AI" doc so meta-questions ("what can you do?", "what can I ask?") get a real answer instead of a knowledge-base miss. See `data/knowledge-base/*.md`.
- **Relevance cutoff:** retrieved chunks past a cosine-distance threshold are dropped before being used as context, so off-topic questions get a normal answer from the model's general knowledge instead of being forced through irrelevant knowledge-base content. The system prompt tells the model to ground its answer in the retrieved context when present.
- **No source citations in the UI:** retrieval still returns which chunks matched (see `src/lib/retrieval.ts`'s `Citation` type) and that data flows through the API response, but the chat UI doesn't render it - by design, so a general-knowledge answer and a knowledge-base-grounded one look the same to the user. Re-adding a citations display would mean re-adding `src/components/CitationList.tsx` (removed) and a render call in `src/components/MessageBubble.tsx`.
- **Crop filtering:** each chunk is tagged with a `crop` (or `"general"` for ad-hoc uploads). Selecting a crop in the sidebar filters retrieval to that crop's chunks plus any general uploads — a lightweight form of metadata-filtered RAG.
- **Embeddings + chat generation:** switchable between two providers via a sidebar toggle - [Ollama](https://ollama.com) (local, no API key, no rate limits; `llama3.2` + `nomic-embed-text`, see `src/lib/ollama/`) or [Gemini](https://aistudio.google.com/apikey) (hosted, needs `GEMINI_API_KEY`; `gemini-flash-latest` + `gemini-embedding-001`, see `src/lib/gemini/`). `LLM_PROVIDER` in `.env.local` sets the server-side default; the toggle overrides it per session.
- **Vector store:** [Chroma](https://www.trychroma.com/), run via Docker. Each provider gets its own collection (`CHROMA_COLLECTION_OLLAMA` / `CHROMA_COLLECTION_GEMINI`) since the two embedding models produce differently-sized vectors that can't share an index - switching providers means seeding that provider's collection separately.
- **Conversation history:** the last 8 non-empty messages are sent with each request so follow-ups ("yes", "tell me more") are understood in context, using each provider's native multi-turn chat API (see `src/lib/chatTurn.ts`).
- **Safety:** the system prompt instructs the model to never state a specific pesticide/fertilizer brand or dosage unless the retrieved context explicitly gives it, to present disease symptoms as "possible causes" rather than a diagnosis, and to recommend a local agricultural expert when unsure.
- **Additional documents:** a generic upload pipeline (PDF/DOCX/TXT/Markdown, tagged `crop: "general"` so uploads stay searchable regardless of the selected crop) exists in the code (`src/components/UploadPanel.tsx`, `src/app/api/ingest/route.ts`) but its sidebar entry point is currently commented out in `src/app/page.tsx` - PDF parsing was unreliable specifically on Vercel (see "Known limitations"). Re-enable by uncommenting the import and `<UploadPanel>` block once that's resolved.
- **Chat management:** **Clear Chat** wipes the whole conversation (with a confirmation prompt); each message also has a hover-revealed **⋮** menu with a **Delete** option to remove just that one message. Both update `localStorage`, so a refresh doesn't bring deleted messages back.

## Prerequisites

- **Node.js** 20+
- **Docker** and **Docker Compose** installed (either the `docker compose` v2 plugin or the standalone `docker-compose` v1 binary)
- **Git** client (optional, but recommended)
- **[Ollama](https://ollama.com/download)** installed - the app's local, offline AI provider. Standard install: `curl -fsSL https://ollama.com/install.sh | sh` (needs sudo). Without sudo, download the `ollama-linux-<arch>.tar.zst` asset from the [latest GitHub release](https://github.com/ollama/ollama/releases/latest), extract it anywhere (e.g. `~/.local/ollama`), and run `<extract-dir>/bin/ollama serve` from there instead - it stores models under `~/.ollama/models` either way.
- Optional: a free **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey), only needed for the Gemini toggle option - Ollama alone is enough to run the app.

## Getting Started

### 1. Clone the Repository (if not already)

```bash
git clone https://github.com/patelsankit06/khedut-ai.git
cd khedut-ai
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

The defaults work as-is for local, Ollama-only use. See [Configuration](#configuration) below to also enable Gemini and/or Chroma Cloud.

### 4. Start Chroma via Docker Compose

```bash
docker compose up -d   # or: docker-compose up -d
```

This will:
- Pull the Chroma image
- Start the Chroma service exposed on port **8000**

Confirm it's up: `curl http://localhost:8000/api/v2/heartbeat`.

### 5. Start Ollama and Pull the Models

```bash
ollama serve &                        # skip if it's already running as a background service
ollama pull llama3.2                  # chat model (~2GB)
ollama pull nomic-embed-text          # embedding model (~270MB)
```

Confirm it's up: `curl http://localhost:11434/api/tags`.

> **Restarting after a reboot:** in an environment where Ollama was installed without root access (no systemd service), it won't start automatically - run `ollama serve` (or `~/.local/ollama/bin/ollama serve` if installed that way) again after every reboot before starting the app. If installed the standard way on a machine with sudo, it runs as a service and this doesn't apply.
>
> CPU-only inference works fine for local development/demo purposes with these small models, just expect answers to stream noticeably slower than a hosted API. If you have more RAM/a GPU available, a larger chat model (e.g. `llama3.1:8b`) gives better answer quality - just update `OLLAMA_CHAT_MODEL` in `.env.local` after pulling it.

### 6. Run the Development Server

```bash
npm run dev
```

Open **http://localhost:3000**.

### 7. Load the Knowledge Base

Click **Load Knowledge Base** in the sidebar to embed and store all 5 crop guides in Chroma, for the currently-selected provider (can also be triggered directly: `curl -X POST http://localhost:3000/api/seed -H "Content-Type: application/json" -d '{"provider":"ollama"}'`). Re-run it any time after editing a file in `data/knowledge-base/`, or after switching providers for the first time, to (re-)seed.

### Enabling Gemini

The **AI Model** toggle in the sidebar lets you switch between Ollama and Gemini per session - no restart needed. To enable the Gemini option:
1. Get a free key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Set `GEMINI_API_KEY=...` in `.env.local`.
3. Reload the page, switch the toggle to Gemini, then click **Load Knowledge Base** to seed Gemini's own collection (it starts empty - Ollama's seeded data doesn't carry over, since the two use different embedding vector spaces).

Without a key set, the Gemini option is shown disabled in the sidebar and the app runs on Ollama only.

## Demo script

1. Click **Load Knowledge Base** in the sidebar — it reports chunk counts per crop.
2. Select **Pomegranate**, then ask "My pomegranate leaves have black spots, what could it be?" — the answer draws on the Diseases section and recommends consulting a local expert rather than naming a chemical.
3. Switch the crop to **Tomato** and ask "What fertilizer approach is recommended during flowering?" — the answer is specific to tomato, not a mix of crops.
4. Deselect the crop (click it again) and ask a general question — retrieval searches across all crops.
5. Ask something entirely unrelated to farming (e.g. "what's the capital of France?") — it still answers normally instead of refusing.
6. Ask a farming question, then reply "yes" or "tell me more" to whatever it offers next — conversation history lets it resolve the follow-up instead of treating "yes" as a fresh, contentless query.
7. Hover a message to reveal its **⋮** menu and delete it, then refresh the page — it stays deleted. Try **Clear Chat** too.
8. Stop Chroma (`docker compose stop`) and ask another question — the UI shows a clear "vector database unreachable" error instead of crashing.
9. With `GEMINI_API_KEY` set, switch the **AI Model** toggle to Gemini, seed its knowledge base, and ask the same pomegranate question — same behavior, different model/collection, answers arrive noticeably faster than local Ollama inference.

## Configuration

All in `.env.local`:

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | server-side default (`ollama` or `gemini`); the sidebar toggle overrides this per session |
| `OLLAMA_URL` | `http://localhost:11434` | |
| `OLLAMA_CHAT_MODEL` | `llama3.2` | must be pulled first: `ollama pull llama3.2` |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | must be pulled first: `ollama pull nomic-embed-text`; changing this requires re-seeding (different models produce differently-sized vectors) |
| `GEMINI_API_KEY` | — | optional; enables the Gemini toggle option when set |
| `GEMINI_CHAT_MODEL` | `gemini-flash-latest` | rolling alias to Google's current free-tier flash model; pin a dated id for reproducible answers |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | |
| `CHROMA_URL` | `http://localhost:8000` | ignored if `CHROMA_API_KEY` is set (Chroma Cloud mode) |
| `CHROMA_COLLECTION_OLLAMA` | `khedut_chunks_ollama` | Ollama's collection - also seeded/queried by uploads made while Ollama is selected |
| `CHROMA_COLLECTION_GEMINI` | `khedut_chunks_gemini` | Gemini's collection, separate because its embeddings aren't compatible with Ollama's |
| `CHROMA_API_KEY` | — | optional; switches to [Chroma Cloud](https://www.trychroma.com/) instead of `CHROMA_URL` - see "Deploying to Vercel" below |
| `CHROMA_TENANT` | — | Chroma Cloud only |
| `CHROMA_DATABASE` | — | Chroma Cloud only |
| `MAX_UPLOAD_MB` | `20` | |

## Deploying to Vercel

The Next.js app deploys to Vercel like any other Next.js project, but two of this app's dependencies can't run *on* Vercel itself:

- **Ollama** is a persistent local server process - Vercel only runs stateless serverless functions, so it's unreachable there. This doesn't require removing Ollama from the code; it just can't be the *deployed* app's provider. Keep using Ollama locally (`LLM_PROVIDER=ollama` in `.env.local`, untouched) and use Gemini for the deployed version instead - both are already fully supported side by side.
- **Chroma** normally runs as a local Docker container, which Vercel also can't host. It needs to live somewhere reachable over the internet instead.

### 1. Set these environment variables in the Vercel project (Project Settings → Environment Variables, not `.env.local` - that file is git-ignored and never gets deployed)

| Variable | Value |
|---|---|
| `LLM_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | your key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE` | from your Chroma Cloud database (see step 2) - **or** `CHROMA_URL` if self-hosting Chroma instead |
| `CHROMA_COLLECTION_GEMINI` | e.g. `khedut_chunks_gemini` (optional, this is the default) |

Leave `OLLAMA_*` unset in Vercel - they're not used there. The sidebar's Ollama option will show disabled automatically once deployed, since the health check can never reach it.

### 2. Get Chroma reachable from the internet - pick one

- **Chroma Cloud** (easiest): sign up at [trychroma.com](https://www.trychroma.com/), create a database, and copy its API key/tenant/database into the Vercel env vars above. No `CHROMA_URL` needed - `CHROMA_API_KEY` being set is what switches the app into Chroma Cloud mode (see `src/lib/vectorstore.ts`).
- **Self-host** on Railway/Render/Fly.io: deploy the same `chromadb/chroma` Docker image this repo's `docker-compose.yml` uses, with a persistent volume, then set `CHROMA_URL` to its public URL instead of the Chroma Cloud variables.

### 3. Deploy, then seed

After the first deploy, open the site and click **Load Knowledge Base** with **Gemini** selected in the sidebar (or `curl -X POST https://<your-app>.vercel.app/api/seed -H "Content-Type: application/json" -d '{"provider":"gemini"}'`) - Gemini's Chroma collection starts empty regardless of what's already seeded locally under Ollama.

### Known limitation: uploads don't durably persist in production

**Additional Documents** (`src/lib/documentRegistry.ts`, `documentContent.ts`) and the knowledge-base seed-status display (`src/lib/knowledgeBaseStatus.ts`) write small JSON files to local disk. Vercel's serverless filesystem is read-only except `/tmp`, so `src/lib/dataDir.ts` redirects these writes to `/tmp` when deployed there instead of throwing - but `/tmp` is ephemeral (wiped on cold start, not shared across instances), so an uploaded document's *listing* and the seed-status display may disappear or become inconsistent between requests in production, even though the actual embedded content in Chroma is unaffected. Fine for a demo; would need a real database (or Vercel Blob/KV) to fix properly for production use.

## Extending the knowledge base

Add or edit a crop guide at `data/knowledge-base/<crop>.md`:

```markdown
---
crop: mango
source: "Khedut AI Mango Cultivation Guide"
---

## Irrigation
...content...

## Diseases
...content...
```

Each `## Heading` becomes a separately-chunked, separately-tagged `category` in the chunk's metadata. Re-run **Load Knowledge Base** (or `POST /api/seed`) to ingest changes — it replaces that crop's previously seeded chunks rather than duplicating them.

## Known limitations (Phase 1 MVP)

- English only — Hindi/Gujarati support, voice input, and image-based disease analysis are Phase 2/3 ideas, not implemented here.
- Crop selection filters by metadata only; there's no keyword/hybrid search layered on top of vector similarity yet.
- Knowledge base content is drafted general agronomy guidance for demo purposes, not sourced from an authoritative agricultural extension document — swap in real sources before any real-world use.
- No per-user auth or multi-tenancy — each provider's Chroma collection is shared across everyone using the app, fine for a local demo.
- Local CPU inference is slower than a hosted API (tens of seconds per answer on a laptop CPU with `llama3.2`), and a 3B model follows instructions (always grounding in retrieved context when it's given) less consistently than a larger hosted model - occasionally it answers from general knowledge even when relevant context was retrieved, or vice versa. Swap in a larger/GPU-accelerated model (`OLLAMA_CHAT_MODEL`) if quality matters more than zero-cost local dev.
- `nomic-embed-text` separates topics less sharply than a hosted embedding model - the relevance cutoff in `src/lib/retrieval.ts` is tuned accordingly, and meta-questions about the assistant itself ("what do you do?") are matched by a small keyword pattern rather than relying on embedding similarity alone, since the two weren't reliably distinguishable by distance score with this model.
- Retrieval only embeds the current message, not the full conversation - conversation history is passed to the model for generation (so "yes"/"tell me more" work), but a follow-up that depends on earlier context for the *knowledge-base search itself* (e.g. "and how do I irrigate it?" three turns after mentioning wheat) may not retrieve the right chunks. History is also capped to the last 8 non-empty messages client-side, to keep prompts short for local CPU inference.
- `data/registry.json` and `data/kb-status.json` are flat files, not a database — fine for a single-user local demo.
- **Additional Documents (file upload) is disabled** (commented out in `src/app/page.tsx`) - PDF parsing worked reliably in local dev but not on Vercel. Three approaches were tried there (LangChain's `PDFLoader` with pdf-parse v2, calling pdf-parse v2 directly, then pdf-parse v1) and all eventually failed at request time with `UnknownErrorException: bad XRef entry` - a pdf.js parsing error, not a missing-dependency/bundling issue (that part was independently confirmed fixed: a plain `.txt` upload succeeds on the same deployment). The cause wasn't pinned down further - possibly a Node version or binary-handling difference between local dev and Vercel's Lambda runtime affecting how the uploaded PDF bytes reach pdf.js. DOCX/TXT/Markdown upload code is unaffected and still works; only the sidebar entry point was disabled since the feature isn't reliable end-to-end. Uploaded documents also aren't tracked by which provider ingested them once re-enabled — a file uploaded while Ollama was selected won't be found when querying under Gemini (and vice versa), though it stays listed in the sidebar either way; deleting it removes it from both collections regardless.
