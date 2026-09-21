"use client";

import type { LlmProvider } from "@/lib/config";

interface ProviderSelectorProps {
  selected: LlmProvider;
  onSelect: (provider: LlmProvider) => void;
  // Present (with a human-readable reason) whenever a provider is currently
  // unusable - Ollama unreachable, Gemini/Groq missing their API key - so
  // the button can be disabled with an explanatory tooltip instead of
  // letting the user pick an option that will just fail on every message.
  disabledReasons: Partial<Record<LlmProvider, string>>;
  // Ollama is a persistent local process - unreachable by definition on a
  // serverless host like Vercel, so its option is hidden entirely there
  // (rather than just shown disabled) instead of dead weight in the UI.
  // `undefined` (health not loaded yet) is treated as supported so the
  // button doesn't flash in and out on first render.
  showOllama?: boolean;
}

const ALL_OPTIONS: { id: LlmProvider; label: string; sub: string; emoji: string }[] = [
  { id: "ollama", label: "Ollama", sub: "Offline", emoji: "🖥️" },
  { id: "gemini", label: "Gemini", sub: "Online", emoji: "☁️" },
  { id: "groq", label: "Groq", sub: "Fast", emoji: "⚡" },
];

export function ProviderSelector({ selected, onSelect, disabledReasons, showOllama = true }: ProviderSelectorProps) {
  const options = showOllama ? ALL_OPTIONS : ALL_OPTIONS.filter((option) => option.id !== "ollama");
  const reasons = Object.entries(disabledReasons)
    .filter(([id]) => showOllama || id !== "ollama")
    .map(([, reason]) => reason)
    .filter((reason): reason is string => Boolean(reason));

  return (
    <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">AI Model</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {showOllama
          ? "Switch between the local model, Gemini, and Groq (a fast fallback for when Gemini's quota runs out)."
          : "Switch between Gemini and Groq (a fast fallback for when Gemini's quota runs out)."}
      </p>
      <div className={`mt-2 grid gap-2 ${showOllama ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((option) => {
          const disabledReason = disabledReasons[option.id];
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              disabled={Boolean(disabledReason)}
              title={disabledReason}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-2 text-xs font-medium transition ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-zinc-200 text-zinc-600 hover:border-emerald-300 dark:border-zinc-800 dark:text-zinc-400"
              } ${disabledReason ? "cursor-not-allowed opacity-40 hover:border-zinc-200 dark:hover:border-zinc-800" : ""}`}
            >
              <span aria-hidden>{option.emoji}</span>
              <span>{option.label}</span>
              <span className="text-[10px] font-normal opacity-70">{option.sub}</span>
            </button>
          );
        })}
      </div>
      {reasons.map((reason) => (
        <p key={reason} className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          {reason}
        </p>
      ))}
    </div>
  );
}
