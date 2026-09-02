import type { Citation } from "@/lib/retrieval";
import { CitationList } from "./CitationList";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
  error?: string;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
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
        {message.citations && message.citations.length > 0 && <CitationList citations={message.citations} />}
      </div>
    </div>
  );
}
