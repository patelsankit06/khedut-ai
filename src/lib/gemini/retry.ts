// @google/genai throws an ApiError with a numeric `.status` field for HTTP failures.
function getStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function isRetryable(error: unknown): boolean {
  const status = getStatusCode(error);
  return status === 429 || (status !== undefined && status >= 500);
}

export function isRateLimitError(error: unknown): boolean {
  return getStatusCode(error) === 429;
}

// Google's own wording for this: "model is currently experiencing high demand
// ... usually temporary" - common on the shared free tier.
export function isServiceUnavailableError(error: unknown): boolean {
  return getStatusCode(error) === 503;
}

export function isAuthOrBadRequestError(error: unknown): boolean {
  const status = getStatusCode(error);
  return status === 400 || status === 401 || status === 403;
}

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1 || !isRetryable(error)) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
