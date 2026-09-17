import { NextResponse } from "next/server";
import { isChromaReachable, isOllamaReachable } from "@/lib/vectorstore";

export const runtime = "nodejs";

export async function GET() {
  const [chromaReachable, ollamaReachable] = await Promise.all([isChromaReachable(), isOllamaReachable()]);

  return NextResponse.json({
    chroma: chromaReachable ? "reachable" : "unreachable",
    ollama: ollamaReachable ? "reachable" : "unreachable",
  });
}
