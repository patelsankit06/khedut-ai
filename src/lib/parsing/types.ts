import { createHash } from "crypto";

export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt", "md", "markdown"] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

// Deliberately not trusting file.type - browsers send inconsistent/missing
// MIME types for .md files, but the filename extension is always reliable.
export function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function isMarkdownExtension(extension: string): boolean {
  return extension === "md" || extension === "markdown";
}

// Derived from the filename (not random) so re-uploading a file with the same
// name overwrites its previous chunks in Chroma instead of duplicating them.
export function deriveDocumentId(filename: string): string {
  return createHash("sha256").update(filename).digest("hex").slice(0, 16);
}
