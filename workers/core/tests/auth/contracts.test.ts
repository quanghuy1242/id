import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authRouteMap } from "../../src/auth/contracts";
import { authPluginConfig } from "../../src/auth/config";
import { getAuthOptions } from "../../src/auth/get-auth";

const oauthProviderTypeSource = readFileSync(
  "node_modules/@better-auth/oauth-provider/dist/oauth-BqWgUea8.d.mts",
  "utf8",
);
const oauthProviderEndpointSource = readFileSync(
  "node_modules/@better-auth/oauth-provider/dist/oauth-C4GaGx2I.d.mts",
  "utf8",
);
const jwtPluginSource = readFileSync("node_modules/better-auth/dist/plugins/jwt/index.mjs", "utf8");
const betterAuthOptionsSource = readFileSync(
  "node_modules/.pnpm/@better-auth+core@1.6.11_@better-auth+utils@0.4.0_@better-fetch+fetch@1.1.21_@cloudflar_12a154a8df76730645b08734298b05c6/node_modules/@better-auth/core/dist/types/init-options.d.mts",
  "utf8",
);

describe("Better Auth installed contract", () => {
  it("records the public auth route map under the configured base path", () => {
    expect(authPluginConfig.issuerPath).toBe("/api/auth");
    expect(authRouteMap).toContainEqual(
      expect.objectContaining({ name: "oauth2UserInfo", path: "/api/auth/oauth2/userinfo" }),
    );
    expect(authRouteMap).not.toContainEqual(expect.objectContaining({ path: "/api/auth/userinfo" }));
  });

  it("proves OAuth Provider endpoint names from installed package types", () => {
    expect(oauthProviderEndpointSource).toContain('createOAuthClient: better_call0.StrictEndpoint<"/oauth2/create-client"');
    expect(oauthProviderEndpointSource).toContain('updateOAuthClient: better_call0.StrictEndpoint<"/oauth2/update-client"');
    expect(oauthProviderEndpointSource).toContain('deleteOAuthClient: better_call0.StrictEndpoint<"/oauth2/delete-client"');
    expect(oauthProviderEndpointSource).toContain('oauth2UserInfo: better_call0.StrictEndpoint<"/oauth2/userinfo"');
  });

  it("proves OAuth Provider audience and custom field hook types", () => {
    expect(oauthProviderTypeSource).toContain("validAudiences?: string[]");
    expect(oauthProviderTypeSource).toContain("customAccessTokenClaims?: (info:");
    expect(oauthProviderTypeSource).toContain("customTokenResponseFields?: (info:");
    expect(oauthProviderTypeSource).toContain("Awaitable<Record<string, any>>");
    expect(oauthProviderTypeSource).toContain("Awaitable<Record<string, unknown>>");
  });

  it("proves JWT plugin jwksPath default and repo override path", () => {
    expect(jwtPluginSource).toContain('const jwksPath = options?.jwks?.jwksPath ?? "/jwks"');
    expect(authPluginConfig.jwksPath).toBe("/jwks");
    expect(authRouteMap).toContainEqual(expect.objectContaining({ name: "getJwks", path: "/api/auth/jwks" }));
  });

  it("proves email/password sign-up uses disableSignUp, not a signup option", () => {
    expect(betterAuthOptionsSource).toContain("disableSignUp?: boolean");
    expect(betterAuthOptionsSource).not.toContain("signup?:");
  });

  it("constructs Better Auth options with plugin-owned resource server schema", () => {
    const options = getAuthOptions(
      {
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: "https://id.example.test",
        DB: {} as D1Database,
        KV: {} as KVNamespace,
      },
      ["https://api.example.test"],
    );

    expect(options.basePath).toBe("/api/auth");
    expect(options.plugins?.some((plugin) => plugin.id === "id-resource-server")).toBe(true);
    expect(options.plugins?.some((plugin) => plugin.id === "oauth-provider")).toBe(true);
  });
});
