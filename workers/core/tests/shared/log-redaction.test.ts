import { describe, expect, it } from "vitest";
import { REDACTED_LOG_VALUE, redactLogFields, structuredLog } from "../../src/shared/log-redaction";

describe("log redaction", () => {
  it("redacts token and secret-bearing fields before structured logging", () => {
    expect(
      redactLogFields({
        client_secret: "secret",
        code: "auth-code",
        path: "/api/auth/oauth2/token",
        userId: "user_1",
      }),
    ).toEqual({
      client_secret: REDACTED_LOG_VALUE,
      code: REDACTED_LOG_VALUE,
      path: "/api/auth/oauth2/token",
      userId: "user_1",
    });
  });

  it("builds structured log records with redaction applied", () => {
    expect(structuredLog("oauth.token", { access_token: "token" })).toEqual({
      event: "oauth.token",
      fields: { access_token: REDACTED_LOG_VALUE },
    });
  });
});

