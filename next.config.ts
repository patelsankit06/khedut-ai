import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pins the workspace root to this project - without it, Turbopack infers a
  // root by walking up for the nearest lockfile and finds an unrelated one in
  // the home directory, which prints a misleading warning.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // pdf-parse pulls in pdfjs-dist, which resolves its worker script via a
  // dynamic import at runtime. Bundling it breaks that resolution ("Setting up
  // fake worker failed"); loading it via native Node require does not.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // LangChain's PDFLoader loads pdf-parse's bundled pdf.js build via
  // import(aVariable) rather than a string literal - Vercel's build-time file
  // tracer can't statically resolve that, so the file silently isn't included
  // in the deployed function and PDF uploads fail there (works fine locally,
  // where the full node_modules tree is on disk regardless of tracing).
  outputFileTracingIncludes: {
    "/api/ingest": ["./node_modules/pdf-parse/**/*", "./node_modules/pdfjs-dist/**/*"],
  },
};

export default nextConfig;
