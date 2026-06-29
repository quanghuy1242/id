import { describe, expect, it } from "vitest";
import {
  parseScopeValue,
  withProtocolScopes,
} from "../../src/auth/plugins/oauth-protocol-scopes/operations";

const PROTOCOL = ["openid", "profile", "email", "offline_access"] as const;

describe("oauth-protocol-scopes / parseScopeValue", () => {
  it("parses an RFC 7591 space-delimited scope string", () => {
    expect(parseScopeValue("content:read content:write")).toEqual([
      "content:read",
      "content:write",
    ]);
  });

  it("parses a scope array, trimming and dropping non-strings/blanks", () => {
    expect(parseScopeValue([" content:read ", "", "content:share", 5])).toEqual(
      ["content:read", "content:share"],
    );
  });

  it("returns an empty list for missing or non-collection values", () => {
    expect(parseScopeValue(undefined)).toEqual([]);
    expect(parseScopeValue(null)).toEqual([]);
    expect(parseScopeValue(42)).toEqual([]);
  });
});

describe("oauth-protocol-scopes / withProtocolScopes", () => {
  it("folds protocol scopes in, protocol-first, before the resource scopes", () => {
    expect(
      withProtocolScopes(["content:read", "content:write"], PROTOCOL),
    ).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "content:read",
      "content:write",
    ]);
  });

  it("does not duplicate a protocol scope the client already requested", () => {
    expect(withProtocolScopes(["openid", "content:read"], PROTOCOL)).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "content:read",
    ]);
  });

  it("yields just the protocol scopes when no resource scopes are requested", () => {
    expect(withProtocolScopes([], PROTOCOL)).toEqual([...PROTOCOL]);
  });
});
