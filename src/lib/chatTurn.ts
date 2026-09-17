// Shared between client and server - kept dependency-free so importing it
// into client components doesn't pull in any server-only code.
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
