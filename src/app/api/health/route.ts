import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { isChromaReachable } from "@/lib/vectorstore";

export const runtime = "nodejs";

export async function GET() {
  const chromaReachable = await isChromaReachable();

  let geminiConfigured = true;
  try {
    getConfig();
  } catch {
    geminiConfigured = false;
  }

  return NextResponse.json({
    chroma: chromaReachable ? "reachable" : "unreachable",
    gemini: geminiConfigured ? "configured" : "missing_api_key",
  });
}
