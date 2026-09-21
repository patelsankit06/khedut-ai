import { NextResponse } from "next/server";
import { isChromaReachable, isOllamaReachable, isGeminiConfigured, isGroqConfigured } from "@/lib/vectorstore";

export const runtime = "nodejs";

export async function GET() {
  const [chromaReachable, ollamaReachable] = await Promise.all([isChromaReachable(), isOllamaReachable()]);

  return NextResponse.json({
    chroma: chromaReachable ? "reachable" : "unreachable",
    ollama: ollamaReachable ? "reachable" : "unreachable",
    gemini: isGeminiConfigured() ? "configured" : "missing_api_key",
    groq: isGroqConfigured() ? "configured" : "missing_api_key",
  });
}
