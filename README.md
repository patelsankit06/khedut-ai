# 🌱 Khedu AI — Smart Farming Assistant

A domain-specific RAG chatbot that helps farmers with crop stages, soil, irrigation, fertilizers, nutrient deficiencies, diseases, and pest management — grounded in a curated agriculture knowledge base, with crop filtering and cited sources.

**Pipeline:** curated crop guides (Markdown) → split into `## `-headed sections → chunk → embed → store in Chroma with `crop`/`category` metadata → retrieve top-K, optionally filtered by selected crop → generate a cited, streamed answer with safety-conscious guardrails.

## Architecture

```
Seed:    data/knowledge-base/<crop>.md -> loadKnowledgeBaseChunks() [split by ## heading -> chunk]
         -> GeminiEmbeddings.embedDocuments() -> Chroma upsert (metadata: crop, category, source)

Chat:    Question (+ selected crop) -> GeminiEmbeddings.embedQuery()
         -> Chroma similaritySearchWithScore(k=4, filter: crop OR "general")
         -> grounded prompt with numbered citations -> Gemini streamed generation -> cited answer
```

- **Stack:** Next.js (App Router) + TypeScript, single codebase for API and UI.
- **Knowledge base:** 5 crops (pomegranate, tomato, wheat, cotton, potato) covering crop stages, soil, irrigation, fertilizers/nutrients, diseases, pests, and harvesting. Pomegranate is the primary/most detailed crop. There's also a `general`-crop "About Khedu AI" doc so meta-questions ("what can you do?", "what can I ask?") get a real answer instead of a knowledge-base miss. See `data/knowledge-base/*.md`.
- **Relevance cutoff:** retrieved chunks past a cosine-distance threshold (0.8) are dropped before citing/answering, so off-topic questions get a clean "I don't know" instead of misleading citations to unrelated chunks.
- **Crop filtering:** each chunk is tagged with a `crop` (or `"general"` for ad-hoc uploads). Selecting a crop in the sidebar filters retrieval to that crop's chunks plus any general uploads — a lightweight form of metadata-filtered RAG.
- **Embeddings + chat generation:** called directly via `@google/genai` (see `src/lib/gemini/`).
- **Vector store:** [Chroma](https://www.trychroma.com/), run via Docker.
- **Safety:** the system prompt instructs the model to never state a specific pesticide/fertilizer brand or dosage unless the retrieved context explicitly gives it, to present disease symptoms as "possible causes" rather than a diagnosis, and to recommend a local agricultural expert when unsure.
- **Additional documents:** the original generic upload pipeline (PDF/DOCX/TXT/Markdown) is still available in the sidebar for supplementary material; uploads are tagged `crop: "general"` so they're always searchable regardless of the selected crop.

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

Confirm Chroma is up: `curl http://localhost:8000/api/v2/heartbeat`.

Open http://localhost:3000, then click **Load Knowledge Base** in the sidebar to seed all 5 crop guides into Chroma (can also be triggered directly: `curl -X POST http://localhost:3000/api/seed`). Re-run it any time after editing a file in `data/knowledge-base/` to re-seed.

## Demo script

1. Click **Load Knowledge Base** in the sidebar — it reports chunk counts per crop.
2. Select **Pomegranate**, then ask "My pomegranate leaves have black spots, what could it be?" — the answer cites the Diseases section and recommends consulting a local expert rather than naming a chemical.
3. Switch the crop to **Tomato** and ask "What fertilizer approach is recommended during flowering?" — citations now come only from the tomato guide.
4. Deselect the crop (click it again) and ask a general question — retrieval searches across all crops.
5. Upload an extra PDF/Markdown file via **Additional Documents** — it's tagged `general` and stays searchable no matter which crop is selected.
6. Stop Chroma (`docker compose stop`) and ask another question — the UI shows a clear "vector database unreachable" error instead of crashing.

## Configuration

All in `.env.local`:

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | required |
| `GEMINI_CHAT_MODEL` | `gemini-flash-latest` | rolling alias to Google's current free-tier flash model; pin a dated id for reproducible answers |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | see the comment in `src/lib/gemini/embeddings.ts` before switching to `gemini-embedding-2` — its batching/task-type semantics differ |
| `CHROMA_URL` | `http://localhost:8000` | |
| `CHROMA_COLLECTION` | `khedu_chunks` | single shared collection for both the seeded knowledge base and any uploads |
| `MAX_UPLOAD_MB` | `20` | |

## Extending the knowledge base

Add or edit a crop guide at `data/knowledge-base/<crop>.md`:

```markdown
---
crop: mango
source: "Khedu AI Mango Cultivation Guide"
---

## Irrigation
...content...

## Diseases
...content...
```

Each `## Heading` becomes a separately-chunked, separately-cited `category`. Re-run **Load Knowledge Base** (or `POST /api/seed`) to ingest changes — it replaces that crop's previously seeded chunks rather than duplicating them.

## Known limitations (Phase 1 MVP)

- English only — Hindi/Gujarati support, voice input, and image-based disease analysis are Phase 2/3 ideas, not implemented here.
- Crop selection filters by metadata only; there's no keyword/hybrid search layered on top of vector similarity yet.
- Knowledge base content is drafted general agronomy guidance for demo purposes, not sourced from an authoritative agricultural extension document — swap in real sources before any real-world use.
- Single shared Chroma collection, no per-user auth — fine for a local demo.
- Gemini free-tier rate limits / occasional 503s apply; retried automatically, surfaced clearly in the UI if they persist.
- `data/registry.json` and `data/kb-status.json` are flat files, not a database — fine for a single-user local demo.
