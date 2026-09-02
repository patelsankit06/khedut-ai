import { NextResponse } from "next/server";
import { listDocuments } from "@/lib/documentRegistry";

export const runtime = "nodejs";

export async function GET() {
  const documents = await listDocuments();
  return NextResponse.json({ documents });
}
