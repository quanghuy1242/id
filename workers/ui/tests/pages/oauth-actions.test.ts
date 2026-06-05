// @vitest-environment jsdom
//
// NOTE: the HTTP behaviour of the action layer is covered by
// tests/lib/auth-fetch.test.ts (the `@id/lib` alias is globally mocked in this
// barrel run, so the real helpers can only be exercised via a source import
// there). This file covers the pure derivation logic, which needs no network.

import { describe, expect, it } from "vitest";
import { clientType, type OAuthClient } from "@/app/admin/_actions/oauth";

const base: OAuthClient = {
  client_id: "c",
  client_name: "n",
  redirect_uris: [],
  grant_types: [],
  response_types: [],
  token_endpoint_auth_method: "client_secret_post",
  scope: "",
};

describe("clientType", () => {
  it("is M2M when client_credentials is granted", () => {
    expect(clientType({ ...base, grant_types: ["client_credentials"] })).toBe(
      "M2M",
    );
  });

  it("is public when token_endpoint_auth_method is none", () => {
    expect(clientType({ ...base, token_endpoint_auth_method: "none" })).toBe(
      "public",
    );
  });

  it("is confidential otherwise", () => {
    expect(clientType({ ...base, grant_types: ["authorization_code"] })).toBe(
      "confidential",
    );
  });
});
