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
  // TEMP DIAGNOSTIC (round 2) - see git history for why: Vercel's runtime-log
  // API is scope-restricted for this account, so this is the only way to see
  // real errors from the deployed app. Revert once diagnosed.
  const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  return {
    body: { error: { code: "INTERNAL_ERROR", message: `Something went wrong. [DEBUG: ${message}]` } },
    status: 500,
  };
}
