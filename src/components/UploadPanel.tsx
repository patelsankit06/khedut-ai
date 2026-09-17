"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentRecord } from "@/lib/documentRegistry";
import { DocumentPreviewModal } from "./DocumentPreviewModal";

type UploadStatus =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string }
  | { kind: "error"; message: string };

export function UploadPanel() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ignore = false;

    async function loadDocuments() {
      try {
        const response = await fetch("/api/documents");
        const data = await response.json();
        if (!ignore) setDocuments(data.documents ?? []);
      } catch {
        // Non-critical: leave the previously loaded list in place.
      }
    }

    loadDocuments();
    return () => {
      ignore = true;
    };
  }, [refreshToken]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];

    setStatus({ kind: "uploading", filename: file.name });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/ingest", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? `Upload failed (${response.status}).`);
      }
      setStatus({ kind: "idle" });
      setRefreshToken((token) => token + 1);
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(doc: DocumentRecord) {
    if (!window.confirm(`Delete "${doc.filename}"? This removes it from the vector store too.`)) {
      return;
    }

    setDeletingId(doc.id);
    try {
      const response = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? `Delete failed (${response.status}).`);
      }
      setPreviewDoc((current) => (current?.id === doc.id ? null : current));
      setRefreshToken((token) => token + 1);
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Delete failed." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Additional Documents</h2>
        <p className="mt-1 text-xs text-zinc-500">Optional extra sources - PDF, DOCX, TXT, or Markdown</p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
        {status.kind === "uploading" ? `Uploading ${status.filename}...` : "Click to upload a file"}
      </label>

      {status.kind === "error" && <p className="text-xs text-red-500">{status.message}</p>}

      <ul className="flex-1 space-y-2 overflow-y-auto">
        {documents.length === 0 && <li className="text-xs text-zinc-400">No documents uploaded yet.</li>}
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 pr-1 transition hover:border-indigo-400 dark:border-zinc-800"
          >
            <button
              type="button"
              onClick={() => setPreviewDoc(doc)}
              title="Click to preview"
              className="min-w-0 flex-1 p-2 text-left text-xs hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              <p className="truncate font-medium text-zinc-700 dark:text-zinc-300">{doc.filename}</p>
              <p className="text-zinc-400">{doc.chunkCount} chunks</p>
            </button>
            <button
              type="button"
              onClick={() => handleDelete(doc)}
              disabled={deletingId === doc.id}
              title="Delete document"
              aria-label={`Delete ${doc.filename}`}
              className="shrink-0 rounded-full p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/40"
            >
              {deletingId === doc.id ? "..." : "✕"}
            </button>
          </li>
        ))}
      </ul>

      {previewDoc && (
        <DocumentPreviewModal
          documentId={previewDoc.id}
          filename={previewDoc.filename}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
