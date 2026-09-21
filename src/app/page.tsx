"use client";

import { useEffect, useState } from "react";
// Additional Documents (PDF/DOCX/TXT/Markdown upload) is disabled for now -
// PDF parsing is unreliable on Vercel (multiple libraries/approaches tried,
// see git history on src/lib/parsing/loadDocument.ts). Re-enable by restoring
// this import and the <UploadPanel> block below once that's sorted out.
// import { UploadPanel } from "@/components/UploadPanel";
import { ChatWindow } from "@/components/ChatWindow";
import { CropSelector } from "@/components/CropSelector";
import { KnowledgeBasePanel } from "@/components/KnowledgeBasePanel";
import { ProviderSelector } from "@/components/ProviderSelector";
import { isCropId, type CropId } from "@/lib/crops";
import type { LlmProvider } from "@/lib/config";

interface HealthState {
  chroma: "reachable" | "unreachable";
  ollama: "reachable" | "unreachable";
  gemini: "configured" | "missing_api_key";
  groq: "configured" | "missing_api_key";
}

const CROP_STORAGE_KEY = "khedut-ai:crop";
const PROVIDER_STORAGE_KEY = "khedut-ai:provider";

function loadStoredCrop(): CropId | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(CROP_STORAGE_KEY);
  return stored && isCropId(stored) ? stored : null;
}

function isLlmProvider(value: string): value is LlmProvider {
  return value === "ollama" || value === "gemini" || value === "groq";
}

function loadStoredProvider(): LlmProvider | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
  return stored && isLlmProvider(stored) ? stored : null;
}

export default function Home() {
  const [health, setHealth] = useState<HealthState | null>(null);
  // Both start at a value consistent with what the server renders (no
  // localStorage there) and load any stored value in an effect below, to
  // avoid a hydration mismatch.
  const [crop, setCrop] = useState<CropId | null>(null);
  const [provider, setProvider] = useState<LlmProvider>("groq");
  // The sidebar (provider/knowledge-base/crop controls) is a slide-in drawer
  // on narrow screens, since there's no room for it next to the chat.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Deliberately loading external (browser-only) state after mount, not
    // synchronizing derived state - localStorage isn't available during SSR,
    // so reading it any earlier would cause a hydration mismatch.
    const storedCrop = loadStoredCrop();
    const storedProvider = loadStoredProvider();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedCrop) setCrop(storedCrop);
    if (storedProvider) setProvider(storedProvider);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch("/api/health");
        const data = (await response.json()) as HealthState;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled)
          setHealth({ chroma: "unreachable", ollama: "unreachable", gemini: "missing_api_key", groq: "missing_api_key" });
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // The selected provider (possibly persisted from a previous session)
  // turned out to be unusable - fall back to the first usable one instead of
  // silently failing every request. Doesn't fire when the current selection
  // is fine, or when nothing else is usable either.
  useEffect(() => {
    if (!health) return;
    const isUsable: Record<LlmProvider, boolean> = {
      ollama: health.ollama === "reachable",
      gemini: health.gemini === "configured",
      groq: health.groq === "configured",
    };
    if (isUsable[provider]) return;
    const fallback = (["groq", "gemini", "ollama"] as const).find((candidate) => isUsable[candidate]);
    if (fallback) handleSelectProvider(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health]);

  function handleSelectCrop(next: CropId | null) {
    setCrop(next);
    try {
      if (next) {
        window.localStorage.setItem(CROP_STORAGE_KEY, next);
      } else {
        window.localStorage.removeItem(CROP_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures (e.g. private browsing).
    }
  }

  function handleSelectProvider(next: LlmProvider) {
    setProvider(next);
    try {
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures (e.g. private browsing).
    }
  }

  const modelOk =
    provider === "gemini"
      ? health?.gemini === "configured"
      : provider === "groq"
        ? health?.groq === "configured"
        : health?.ollama === "reachable";

  const providerDisabledReasons: Partial<Record<LlmProvider, string>> = {};
  if (health?.ollama === "unreachable") {
    providerDisabledReasons.ollama = "Ollama isn't reachable - run 'ollama serve' locally to enable this.";
  }
  if (health?.gemini === "missing_api_key") {
    providerDisabledReasons.gemini = "Add GEMINI_API_KEY to .env.local to enable this.";
  }
  if (health?.groq === "missing_api_key") {
    providerDisabledReasons.groq = "Add GROQ_API_KEY to .env.local to enable this.";
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="-ml-1.5 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M3 5.5A1 1 0 014 4.5h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
            </svg>
          </button>
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">🌱 Khedut AI</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
          <a
            href="https://patelsankit2.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-purple-700 hover:underline dark:text-purple-400"
          >
            Patelsankit Portfolio
          </a>
          {health && (
            <div className="flex flex-wrap gap-2">
              <StatusPill label="Knowledge Base" ok={health.chroma === "reachable"} />
              <StatusPill
                label={provider === "gemini" ? "Gemini" : provider === "groq" ? "Groq" : "Ollama"}
                ok={Boolean(modelOk)}
              />
            </div>
          )}
        </div>
      </header>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[280px_1fr]">
        {sidebarOpen && (
          <div
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-hidden bg-zinc-50 shadow-xl transition-transform duration-200 dark:bg-zinc-950 md:static md:z-auto md:w-auto md:max-w-none md:translate-x-0 md:border-r md:border-zinc-200 md:shadow-none md:dark:border-zinc-800 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Menu</span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto">
            <ProviderSelector selected={provider} onSelect={handleSelectProvider} disabledReasons={providerDisabledReasons} />
            {/* Remounts (fresh status/error state) whenever the provider changes,
                instead of clearing that state imperatively in an effect. */}
            <KnowledgeBasePanel key={provider} provider={provider} />
            <CropSelector selected={crop} onSelect={handleSelectCrop} />
            {/* Additional Documents upload disabled for now - see import comment above. */}
            {/* <div className="min-h-0 flex-1 overflow-hidden">
              <UploadPanel provider={provider} />
            </div> */}
          </div>
        </aside>
        <section className="flex flex-col overflow-hidden">
          <ChatWindow crop={crop} provider={provider} />
        </section>
      </div>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}
