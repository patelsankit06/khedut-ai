"use client";

import { useEffect, useRef, useState } from "react";
import type { Citation } from "@/lib/retrieval";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
  error?: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onDelete: () => void;
  deletable: boolean;
}

export function MessageBubble({ message, onDelete, deletable }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const menuButton = deletable && (
    <div ref={menuRef} className="relative shrink-0 self-center opacity-40 transition group-hover:opacity-100">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Message actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="rounded-full p-1 text-zinc-400 hover:bg-black/5 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={`group flex items-start gap-1 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-indigo-600 text-white"
            : "border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        }`}
      >
        {message.content}
        {message.isStreaming && (
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-middle" />
        )}
        {message.error && <p className="mt-2 text-xs text-red-500">{message.error}</p>}
      </div>
      {menuButton}
    </div>
  );
}
