"use client";

import { useEffect, useState } from "react";
import { UploadPanel } from "@/components/UploadPanel";
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
}

const CROP_STORAGE_KEY = "khedut-ai:crop";
const PROVIDER_STORAGE_KEY = "khedut-ai:provider";

function loadStoredCrop(): CropId | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(CROP_STORAGE_KEY);
  return stored && isCropId(stored) ? stored : null;
}

function isLlmProvider(value: string): value is LlmProvider {
  return value === "ollama" || value === "gemini";
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
  const [provider, setProvider] = useState<LlmProvider>("ollama");

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
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch("/api/health");
        const data = (await response.json()) as HealthState;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth({ chroma: "unreachable", ollama: "unreachable", gemini: "missing_api_key" });
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
  // turned out to be unusable but the other one isn't - fall back instead of
  // silently failing every request. Doesn't fire when both are unusable
  // (nothing better to switch to) or both are fine (nothing to do).
  useEffect(() => {
    if (!health) return;
    if (provider === "gemini" && health.gemini === "missing_api_key" && health.ollama === "reachable") {
      handleSelectProvider("ollama");
    } else if (provider === "ollama" && health.ollama === "unreachable" && health.gemini === "configured") {
      handleSelectProvider("gemini");
    }
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

  const modelOk = provider === "gemini" ? health?.gemini === "configured" : health?.ollama === "reachable";

  const providerDisabledReasons: Partial<Record<LlmProvider, string>> = {};
  if (health?.ollama === "unreachable") {
    providerDisabledReasons.ollama = "Ollama isn't reachable - run 'ollama serve' locally to enable this.";
  }
  if (health?.gemini === "missing_api_key") {
    providerDisabledReasons.gemini = "Add GEMINI_API_KEY to .env.local to enable this.";
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">🌱 Khedut AI</h1>
        {health && (
          <div className="flex gap-2 text-xs">
            <StatusPill label="Knowledge Base" ok={health.chroma === "reachable"} />
            <StatusPill label={provider === "gemini" ? "Gemini" : "Ollama"} ok={Boolean(modelOk)} />
          </div>
        )}
      </header>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[280px_1fr]">
        <aside className="hidden flex-col overflow-hidden border-r border-zinc-200 md:flex dark:border-zinc-800">
          <ProviderSelector selected={provider} onSelect={handleSelectProvider} disabledReasons={providerDisabledReasons} />
          {/* Remounts (fresh status/error state) whenever the provider changes,
              instead of clearing that state imperatively in an effect. */}
          <KnowledgeBasePanel key={provider} provider={provider} />
          <CropSelector selected={crop} onSelect={handleSelectCrop} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <UploadPanel provider={provider} />
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
