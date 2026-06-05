import { describe, expect, it, vi } from "vitest";
import { createResendAuthEmailSender } from "../../src/auth/adapters/resend-email";
import type { ResendEmailError } from "../../src/shared/errors";

describe("Resend transactional email adapter", () => {
  it("sends verification email through the Resend REST API", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "email_1" }),
    );
    const sender = createResendAuthEmailSender(
      {
        apiKey: "re_test_key",
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
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer re_test_key",
          "content-type": "application/json",
        },
      }),
    );
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toEqual(
      expect.objectContaining({
        from: "id <id@example.test>",
        to: ["alice@example.test"],
        subject: "Verify your email for id",
      }),
    );
    expect(body.text).toContain(
      "https://id.example.test/api/auth/verify-email",
    );
    expect(body.html).toContain(
      "https://id.example.test/api/auth/verify-email",
    );
  });

  it("sends the admin OTP code without a link", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "email_2" }),
    );
    const sender = createResendAuthEmailSender(
      { apiKey: "re_test_key", fromEmail: "id@example.test", fromName: "id" },
      fetcher as unknown as typeof fetch,
    );

    await sender.send({
      kind: "admin-otp",
      to: "admin@example.test",
      otp: "123456",
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual(["admin@example.test"]);
    expect(body.subject).toBe("Your id admin verification code");
    expect(body.text).toContain("123456");
    expect(body.html).toContain("123456");
  });

  it("fails on Resend rejection with retry metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          name: "rate_limit_exceeded",
          message: "Too many requests",
          statusCode: 429,
        },
        {
          status: 429,
          headers: {
            "retry-after": "30",
            "ratelimit-limit": "10",
            "ratelimit-remaining": "0",
            "ratelimit-reset": "1779259293",
          },
        },
      ),
    );
    const sender = createResendAuthEmailSender(
      { apiKey: "re_test_key", fromEmail: "id@example.test", fromName: "id" },
      fetcher as unknown as typeof fetch,
    );

    const expectedError = {
      status: 429,
      rateLimit: {
        retryAfter: "30",
        limit: "10",
        remaining: "0",
        reset: "1779259293",
      },
    } satisfies Partial<ResendEmailError>;

    await expect(
      sender.send({
        kind: "password-reset",
        to: "alice@example.test",
        url: "https://id.example.test/reset",
      }),
    ).rejects.toMatchObject(expectedError);
  });
});
