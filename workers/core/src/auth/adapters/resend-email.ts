// Resend transactional email: https://resend.com/docs/api-reference/emails/send-email
import { renderAuthEmail } from "./auth-email-render";
import {
  ResendEmailError,
  type EmailRateLimitMetadata,
} from "../../shared/errors";
import type { AuthEmailMessage, AuthEmailSender } from "../types";

const resendEmailsUrl = "https://api.resend.com/emails";

export type ResendEmailConfig = {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
};

type ResendApiError = {
  readonly message?: string;
  readonly name?: string;
  readonly statusCode?: number;
};

function requireResendConfig(config: ResendEmailConfig): void {
  if (!config.apiKey || !config.fromEmail) {
    throw new ResendEmailError("Resend email is not configured", 0);
  }
}

function fromAddress(config: ResendEmailConfig): string {
  return config.fromName
    ? `${config.fromName} <${config.fromEmail}>`
    : config.fromEmail;
}

function rateLimitMetadata(headers: Headers): EmailRateLimitMetadata {
  return {
    retryAfter: headers.get("retry-after") ?? undefined,
    limit: headers.get("ratelimit-limit") ?? undefined,
    remaining: headers.get("ratelimit-remaining") ?? undefined,
    reset: headers.get("ratelimit-reset") ?? undefined,
  };
}

export function createResendAuthEmailSender(
  config: ResendEmailConfig,
  fetcher: typeof fetch = fetch,
): AuthEmailSender {
  return {
    async send(message: AuthEmailMessage): Promise<void> {
      requireResendConfig(config);
      const rendered = renderAuthEmail(message);
      const response = await fetcher(resendEmailsUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(config),
          to: [message.to],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        }),
      });

      if (!response.ok) {
        const body = (await response
          .json()
          .catch(() => ({}))) as ResendApiError;
        throw new ResendEmailError(
          body.message ??
            `Resend rejected transactional email with HTTP ${response.status}`,
          response.status,
          rateLimitMetadata(response.headers),
        );
      }
    },
  };
}
