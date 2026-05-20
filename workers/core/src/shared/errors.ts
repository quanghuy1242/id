export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export type SenderRateLimitMetadata = {
  readonly retryAfter?: string;
  readonly limit?: string;
  readonly remaining?: string;
  readonly reset?: string;
};

export class SenderEmailError extends Error {
  readonly status: number;
  readonly rateLimit: SenderRateLimitMetadata;

  constructor(message: string, status: number, rateLimit: SenderRateLimitMetadata = {}) {
    super(message);
    this.name = "SenderEmailError";
    this.status = status;
    this.rateLimit = rateLimit;
  }
}
