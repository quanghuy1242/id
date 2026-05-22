import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { authPluginConfig } from "../config";

const wellKnownOauthServer = "/.well-known/oauth-authorization-server";
const wellKnownOidc = "/.well-known/openid-configuration";

type WellKnownMetadataKind = "oauth-authorization-server" | "openid-configuration";

/**
 * OAuth Provider intentionally keeps these metadata endpoints server-callable
 * instead of exposing them through Better Auth's HTTP router. better-call skips
 * endpoints marked SERVER_ONLY, and the oauth-provider package exports these
 * helpers so the host app can mount discovery at the standards-defined public
 * URLs for its issuer. That matters here because our issuer is the Better Auth
 * base path (`/api/auth`), while OAuth/OIDC discovery also needs root
 * well-known aliases such as `/.well-known/oauth-authorization-server/api/auth`.
 *
 * This is different from JWKS: Better Auth's JWT plugin exposes `/jwks` as a
 * normal HTTP route under the Better Auth base path, and discovery advertises
 * that canonical `/api/auth/jwks` route.
 */
function getWellKnownMetadataKind(pathname: string): WellKnownMetadataKind | undefined {
  if (
    pathname === wellKnownOauthServer ||
    pathname === `${authPluginConfig.issuerPath}${wellKnownOauthServer}` ||
    pathname === `${wellKnownOauthServer}${authPluginConfig.issuerPath}`
  ) {
    return "oauth-authorization-server";
  }

  if (
    pathname === wellKnownOidc ||
    pathname === `${authPluginConfig.issuerPath}${wellKnownOidc}` ||
    pathname === `${wellKnownOidc}${authPluginConfig.issuerPath}`
  ) {
    return "openid-configuration";
  }

  return undefined;
}

export function authPathIsWellKnown(pathname: string): boolean {
  return getWellKnownMetadataKind(pathname) !== undefined;
}

/**
 * Delegate to oauth-provider's exported discovery helpers rather than
 * `auth.handler()`. The helpers call the plugin's server API directly and are
 * the supported bridge between app-owned public well-known routes and the
 * plugin-owned metadata generator.
 */
export async function handleWellKnown(auth: unknown, request: Request): Promise<Response> {
  if (getWellKnownMetadataKind(new URL(request.url).pathname) === "oauth-authorization-server") {
    return oauthProviderAuthServerMetadata(
      auth as { readonly api: { readonly getOAuthServerConfig: (...args: unknown[]) => unknown } },
    )(request);
  }

  return oauthProviderOpenIdConfigMetadata(
    auth as { readonly api: { readonly getOpenIdConfig: (...args: unknown[]) => unknown } },
  )(request);
}
