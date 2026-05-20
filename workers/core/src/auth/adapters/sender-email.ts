import { renderAuthEmail, type AuthEmailMessage, type AuthEmailSender } from "./auth-email";
import { SenderEmailError } from "../../shared/errors";

const senderTransactionalUrl = "https://api.sender.net/v2/message/send";

export type SenderEmailConfig = {
  readonly apiToken: string;
  readonly fromEmail: string;
  readonly fromName: string;
};

export type SenderRateLimitMetadata = {
  readonly retryAfter?: string;
  readonly limit?: string;
  readonly remaining?: string;
  readonly reset?: string;
};

type SenderApiResponse = {
  readonly success?: boolean;
  readonly message?: string;
  readonly emailId?: string;
};

function requireSenderConfig(config: SenderEmailConfig): void {
  if (!config.apiToken || !config.fromEmail) {
    throw new SenderEmailError("Sender email is not configured", 0);
  }
}

function rateLimitMetadata(headers: Headers): SenderRateLimitMetadata {
  return {
    retryAfter: headers.get("retry-after") ?? undefined,
    limit: headers.get("x-ratelimit-limit") ?? undefined,
    remaining: headers.get("x-ratelimit-remaining") ?? undefined,
    reset: headers.get("x-ratelimit-reset") ?? undefined,
  };
}

export function createSenderAuthEmailSender(
  config: SenderEmailConfig,
  fetcher: typeof fetch = fetch,
): AuthEmailSender {
  return {
    async send(message: AuthEmailMessage): Promise<void> {
      requireSenderConfig(config);
      const rendered = renderAuthEmail(message);
      const response = await fetcher(senderTransactionalUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: {
            email: config.fromEmail,
            name: config.fromName,
          },
          to: [
            {
              email: message.to,
            },
          ],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as SenderApiResponse;
      if (!response.ok || body.success === false) {
        throw new SenderEmailError(
          body.message ?? `Sender rejected transactional email with HTTP ${response.status}`,
          response.status,
          rateLimitMetadata(response.headers),
        );
      }
    },
  };
}
