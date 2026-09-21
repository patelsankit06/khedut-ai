import { NextResponse } from "next/server";
import { isChromaReachable, isOllamaReachable, isGeminiConfigured, isGroqConfigured } from "@/lib/vectorstore";

export const runtime = "nodejs";

export async function GET() {
  const [chromaReachable, ollamaReachable] = await Promise.all([isChromaReachable(), isOllamaReachable()]);

  return NextResponse.json({
    chroma: chromaReachable ? "reachable" : "unreachable",
    ollama: ollamaReachable ? "reachable" : "unreachable",
    // Ollama is a persistent local process - it can never be reached from a
    // Vercel serverless function, so the sidebar hides the option entirely
    // there rather than just showing it disabled (process.env.VERCEL is set
    // automatically on every Vercel deployment).
    ollamaSupported: !process.env.VERCEL,
    gemini: isGeminiConfigured() ? "configured" : "missing_api_key",
    groq: isGroqConfigured() ? "configured" : "missing_api_key",
  });
}
