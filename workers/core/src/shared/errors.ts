export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export type EmailRateLimitMetadata = {
  readonly retryAfter?: string;
  readonly limit?: string;
  readonly remaining?: string;
  readonly reset?: string;
};

export class ResendEmailError extends Error {
  readonly status: number;
  readonly rateLimit: EmailRateLimitMetadata;

  constructor(
    message: string,
    status: number,
    rateLimit: EmailRateLimitMetadata = {},
  ) {
    super(message);
    this.name = "ResendEmailError";
    this.status = status;
    this.rateLimit = rateLimit;
  }
}
