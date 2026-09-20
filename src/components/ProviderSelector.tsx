"use client";

import type { LlmProvider } from "@/lib/config";

interface ProviderSelectorProps {
  selected: LlmProvider;
  onSelect: (provider: LlmProvider) => void;
  geminiConfigured: boolean;
}

const OPTIONS: { id: LlmProvider; label: string; emoji: string }[] = [
  { id: "ollama", label: "Ollama (Offline)", emoji: "🖥️" },
  { id: "gemini", label: "Gemini (Online)", emoji: "☁️" },
];

export function ProviderSelector({ selected, onSelect, geminiConfigured }: ProviderSelectorProps) {
  return (
    <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">AI Model</h2>
      <p className="mt-1 text-xs text-zinc-500">Switch between the local model and Gemini.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => {
          const disabled = option.id === "gemini" && !geminiConfigured;
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              disabled={disabled}
              title={disabled ? "Add GEMINI_API_KEY to .env.local to enable this" : undefined}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-zinc-200 text-zinc-600 hover:border-emerald-300 dark:border-zinc-800 dark:text-zinc-400"
              } ${disabled ? "cursor-not-allowed opacity-40 hover:border-zinc-200 dark:hover:border-zinc-800" : ""}`}
            >
              <span aria-hidden>{option.emoji}</span>
              {option.label}
            </button>
          );
        })}
      </div>
      {!geminiConfigured && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Add GEMINI_API_KEY to .env.local to enable Gemini.
        </p>
      )}
    </div>
  );
}
