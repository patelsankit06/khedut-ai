import path from "path";

// Vercel's serverless functions have a read-only filesystem except /tmp -
// writing to a process.cwd()-relative path (the deployment bundle) throws
// there. /tmp is writable but ephemeral (wiped between invocations/cold
// starts, not shared across concurrent instances), which is an acceptable
// trade-off for this app's non-critical local state (upload registry, seed
// status) but NOT a real fix for durable storage - see the README's
// "Deploying to Vercel" section before relying on uploads persisting there.
export function dataDir(): string {
  return process.env.VERCEL ? "/tmp/khedut-ai-data" : path.join(process.cwd(), "data");
}
