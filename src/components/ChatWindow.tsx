"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Citation } from "@/lib/retrieval";
import type { CropId } from "@/lib/crops";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

type StreamEvent =
  | { type: "citations"; data: Citation[] }
  | { type: "token"; data: string }
  | { type: "done" }
  | { type: "error"; message: string };

const STORAGE_KEY = "khedu-ai:messages";

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    // Drop any message left mid-stream by a previous session.
    return parsed.map((message) =>
      message.isStreaming ? { ...message, isStreaming: false } : message
    );
  } catch {
    return [];
  }
}

export function ChatWindow({ crop }: { crop: CropId | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Follows the conversation as it grows: fires on submit (new user message),
  // on every streamed token, and on completion/error.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Ignore storage failures (e.g. quota exceeded or private browsing).
    }
  }, [messages]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isSending) return;

    const assistantIndex = messages.length + 1;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);
    setQuestion("");
    setIsSending(true);

    const updateAssistant = (patch: Partial<ChatMessage>) => {
      setMessages((prev) => {
        const current = prev[assistantIndex];
        if (!current) return prev;
        const next = [...prev];
        next[assistantIndex] = { ...current, ...patch };
        return next;
      });
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, crop: crop ?? undefined }),
      });

      if (!response.ok || !response.body) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error?.message ?? `Request failed (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as StreamEvent;

          if (parsed.type === "citations") {
            updateAssistant({ citations: parsed.data });
          } else if (parsed.type === "token") {
            setMessages((prev) => {
              const current = prev[assistantIndex];
              if (!current) return prev;
              const next = [...prev];
              next[assistantIndex] = { ...current, content: current.content + parsed.data };
              return next;
            });
          } else if (parsed.type === "done") {
            updateAssistant({ isStreaming: false });
          } else if (parsed.type === "error") {
            updateAssistant({ isStreaming: false, error: parsed.message });
          }
        }
      }
    } catch (error) {
      updateAssistant({
        isStreaming: false,
        error: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            {crop
              ? `Ask about ${crop} crop care - stages, soil, irrigation, fertilizers, diseases, or pests.`
              : "Pick a crop in the sidebar for focused answers, or ask a general farming question."}{" "}
            Answers are grounded in the farming knowledge base, with sources cited.
          </p>
        )}
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={crop ? `Ask about ${crop}...` : "Ask a farming question..."}
          className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !question.trim()}
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
