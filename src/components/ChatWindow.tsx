"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Citation } from "@/lib/retrieval";
import type { CropId } from "@/lib/crops";
import type { ChatTurn } from "@/lib/chatTurn";
import type { LlmProvider } from "@/lib/config";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

// Kept short since local CPU inference is already slow - a long history adds
// directly to prompt-processing time on every turn.
const MAX_HISTORY_TURNS = 8;

type StreamEvent =
  | { type: "citations"; data: Citation[] }
  | { type: "token"; data: string }
  | { type: "done" }
  | { type: "error"; message: string };

const STORAGE_KEY = "khedut-ai:messages";

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    // Drop any message left mid-stream by a previous session.
    return parsed.map((message) =>
      message.isStreaming ? { ...message, isStreaming: false } : message,
    );
  } catch {
    return [];
  }
}

export function ChatWindow({ crop, provider }: { crop: CropId | null; provider: LlmProvider }) {
  // Starts empty (matching what the server renders, since it has no
  // localStorage) and loads any stored conversation in an effect below -
  // reading localStorage during the initial render would make the client's
  // first paint diverge from the server-rendered HTML and trigger a
  // hydration mismatch.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Deliberately loading external (browser-only) state after mount, not
    // synchronizing derived state - localStorage isn't available during SSR,
    // so reading it any earlier would cause a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadStoredMessages());
    setHasHydrated(true);
  }, []);

  // Follows the conversation as it grows: fires on submit (new user message),
  // on every streamed token, and on completion/error.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    // Skip until the load-from-storage effect above has run, otherwise this
    // fires first (with the initial empty array) and overwrites the stored
    // conversation before it's ever loaded.
    if (!hasHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Ignore storage failures (e.g. quota exceeded or private browsing).
    }
  }, [messages, hasHydrated]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isSending) return;

    // Built from state before this turn's messages are appended below, so it
    // excludes the new question and the empty streaming placeholder.
    const history: ChatTurn[] = messages
      .filter((message) => message.content.trim().length > 0)
      .slice(-MAX_HISTORY_TURNS)
      .map((message) => ({ role: message.role, content: message.content }));

    const assistantIndex = messages.length + 1;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", isStreaming: true },
    ]);
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
        body: JSON.stringify({
          question: trimmed,
          crop: crop ?? undefined,
          provider,
          history,
        }),
      });

      if (!response.ok || !response.body) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.error?.message ?? `Request failed (${response.status}).`,
        );
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
              next[assistantIndex] = {
                ...current,
                content: current.content + parsed.data,
              };
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

  function handleClearChat() {
    if (isSending) return;
    if (!window.confirm("Clear the whole conversation? This can't be undone."))
      return;
    setMessages([]);
  }

  function handleDeleteMessage(index: number) {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="flex h-full flex-col">
      {messages.length > 0 && (
        <div className="flex items-center justify-end border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleClearChat}
            disabled={isSending}
            className="rounded-full px-3 py-1 text-xs font-medium text-zinc-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40"
          >
            Clear Chat
          </button>
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            {crop
              ? `Ask about ${crop} crop care - stages, soil, irrigation, fertilizers, diseases, or pests.`
              : "Pick a crop in the sidebar for focused answers, or ask a general farming question."}{" "}
            Answers are cited when they draw from the knowledge base, and I can
            chat about anything else too.
          </p>
        )}
        {messages.map((message, index) => (
          <MessageBubble
            key={index}
            message={message}
            deletable={!isSending}
            onDelete={() => handleDeleteMessage(index)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-zinc-200 p-3 sm:p-4 dark:border-zinc-800"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            crop ? `Ask about ${crop}...` : "Ask a farming question..."
          }
          className="min-w-0 flex-1 rounded-lg border border-zinc-400 bg-white px-3 py-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 sm:px-4 sm:py-4 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          disabled={isSending}
          autoFocus
        />
        <button
          type="submit"
          disabled={isSending || !question.trim()}
          className="shrink-0 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-40 sm:px-10"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
