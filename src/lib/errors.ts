export type ErrorCode =
  | "UNSUPPORTED_FILE_TYPE"
  | "EMPTY_DOCUMENT"
  | "FILE_TOO_LARGE"
  | "VECTOR_STORE_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "MODEL_API_ERROR"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  code: ErrorCode;
  httpStatus: number;

  constructor(code: ErrorCode, message: string, httpStatus: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function toErrorPayload(error: unknown): {
  body: { error: { code: ErrorCode; message: string } };
  status: number;
} {
  if (error instanceof AppError) {
    return {
      body: { error: { code: error.code, message: error.message } },
      status: error.httpStatus,
    };
  }

  console.error(error);
  // TEMP DIAGNOSTIC: surfacing the real message to debug a Vercel-only PDF
  // upload failure that Vercel's runtime-log API is blocking us from seeing
  // directly (403, tier/scope-restricted). Revert to a generic message once
  // diagnosed - don't leak internals in the long run.
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return {
    body: { error: { code: "INTERNAL_ERROR", message: `Something went wrong. [DEBUG: ${message}]` } },
    status: 500,
  };
}
