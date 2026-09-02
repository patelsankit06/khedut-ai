"use client";

import { useEffect, useState } from "react";

interface DocumentPreviewModalProps {
  documentId: string;
  filename: string;
  onClose: () => void;
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: string };

export function DocumentPreviewModal({ documentId, filename, onClose }: DocumentPreviewModalProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    let ignore = false;

    async function loadContent() {
      try {
        const response = await fetch(`/api/documents/${documentId}`);
        const data = await response.json();
        if (ignore) return;
        if (!response.ok) {
          setState({ status: "error", message: data?.error?.message ?? "Failed to load preview." });
          return;
        }
        setState({ status: "ready", content: data.content });
      } catch {
        if (!ignore) setState({ status: "error", message: "Failed to load preview." });
      }
    }

    loadContent();
    return () => {
      ignore = true;
    };
  }, [documentId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="truncate pr-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{filename}</h3>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {state.status === "loading" && <p className="text-sm text-zinc-500">Loading preview...</p>}
          {state.status === "error" && <p className="text-sm text-red-500">{state.message}</p>}
          {state.status === "ready" && (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {state.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
