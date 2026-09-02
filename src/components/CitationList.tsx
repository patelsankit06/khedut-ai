import type { Citation } from "@/lib/retrieval";

export function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-black/10 pt-2 dark:border-white/10">
      {citations.map((citation) => (
        <span
          key={citation.n}
          title={`similarity score ${citation.score.toFixed(3)}`}
          className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
        >
          [{citation.n}] {citation.source}
          {citation.page !== undefined ? ` p.${citation.page}` : ""}
        </span>
      ))}
    </div>
  );
}
