"use client";

import { useEffect, useState } from "react";

interface KnowledgeBaseStatus {
  seededAt: string;
  totalChunks: number;
  perCrop: Record<string, number>;
}

export function KnowledgeBasePanel() {
  const [status, setStatus] = useState<KnowledgeBaseStatus | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/seed")
      .then((response) => response.json())
      .then((data) => {
        if (!ignore) setStatus(data.status ?? null);
      })
      .catch(() => {
        // Non-critical: leave status unset, the seed button still works.
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    try {
      const response = await fetch("/api/seed", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? `Failed to load knowledge base (${response.status}).`);
      }
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge base.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Farming Knowledge Base</h2>
      {status ? (
        <p className="mt-1 text-xs text-zinc-500">
          {status.totalChunks} chunks loaded across {Object.keys(status.perCrop).length} crops.
        </p>
      ) : (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Not loaded yet.</p>
      )}
      <button
        type="button"
        onClick={handleSeed}
        disabled={seeding}
        className="mt-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
      >
        {seeding ? "Loading..." : status ? "Refresh Knowledge Base" : "Load Knowledge Base"}
      </button>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
