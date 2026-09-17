"use client";

import { CROPS, type CropId } from "@/lib/crops";

interface CropSelectorProps {
  selected: CropId | null;
  onSelect: (crop: CropId | null) => void;
}

export function CropSelector({ selected, onSelect }: CropSelectorProps) {
  return (
    <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Select Your Crop</h2>
      <p className="mt-1 text-xs text-zinc-500">Narrows answers to crop-specific guidance.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CROPS.map((crop) => {
          const isSelected = selected === crop.id;
          return (
            <button
              key={crop.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : crop.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-zinc-200 text-zinc-600 hover:border-emerald-300 dark:border-zinc-800 dark:text-zinc-400"
              }`}
            >
              <span aria-hidden>{crop.emoji}</span>
              {crop.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
