"use client";

import { useEffect, useState } from "react";
import { UploadPanel } from "@/components/UploadPanel";
import { ChatWindow } from "@/components/ChatWindow";

interface HealthState {
  chroma: "reachable" | "unreachable";
  gemini: "configured" | "missing_api_key";
}

export default function Home() {
  const [health, setHealth] = useState<HealthState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch("/api/health");
        const data = (await response.json()) as HealthState;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth({ chroma: "unreachable", gemini: "missing_api_key" });
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">RAG Chatbot</h1>
        {health && (
          <div className="flex gap-2 text-xs">
            <StatusPill label="Chroma" ok={health.chroma === "reachable"} />
            <StatusPill label="Gemini" ok={health.gemini === "configured"} />
          </div>
        )}
      </header>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[280px_1fr]">
        <aside className="hidden overflow-hidden border-r border-zinc-200 md:block dark:border-zinc-800">
          <UploadPanel />
        </aside>
        <section className="flex flex-col overflow-hidden">
          <ChatWindow />
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
