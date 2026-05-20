import { describe, expect, it, vi } from "vitest";
import { createSenderAuthEmailSender } from "../../src/auth/adapters/sender-email";
import type { SenderEmailError } from "../../src/shared/errors";

describe("Sender transactional email adapter", () => {
  it("sends verification email through Sender REST API", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ success: true, message: "queued", emailId: "email_1" }),
    );
    const sender = createSenderAuthEmailSender(
      {
        apiToken: "sender-token",
        fromEmail: "id@example.test",
        fromName: "id",
      },
      fetcher as unknown as typeof fetch,
    );

    await sender.send({
      kind: "verification",
      to: "alice@example.test",
      url: "https://id.example.test/api/auth/verify-email?token=secret",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.sender.net/v2/message/send",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer sender-token",
          "content-type": "application/json",
        },
      }),
    );
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toEqual(
      expect.objectContaining({
        from: { email: "id@example.test", name: "id" },
        to: [{ email: "alice@example.test" }],
        subject: "Verify your email for id",
      }),
    );
    expect(body.text).toContain("https://id.example.test/api/auth/verify-email");
    expect(body.html).toContain("https://id.example.test/api/auth/verify-email");
  });

  it("fails on Sender rejection with retry metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { success: false, message: "rate limited" },
        {
          status: 429,
          headers: {
            "retry-after": "30",
            "x-ratelimit-limit": "60",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1779259293",
          },
        },
      ),
    );
    const sender = createSenderAuthEmailSender(
      {
        apiToken: "sender-token",
        fromEmail: "id@example.test",
        fromName: "id",
      },
      fetcher as unknown as typeof fetch,
    );

    await expect(
      sender.send({
        kind: "password-reset",
        to: "alice@example.test",
        url: "https://id.example.test/reset",
      }),
    ).rejects.toMatchObject<Partial<SenderEmailError>>({
      status: 429,
      rateLimit: {
        retryAfter: "30",
        limit: "60",
        remaining: "0",
        reset: "1779259293",
      },
    });
  });
});
