export type ErrorCode =
  | "UNSUPPORTED_FILE_TYPE"
  | "EMPTY_DOCUMENT"
  | "FILE_TOO_LARGE"
  | "VECTOR_STORE_UNAVAILABLE"
  | "GEMINI_API_ERROR"
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
  return {
    body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } },
    status: 500,
  };
}
