import type { AuthRuntimeOptions } from "../types";
import { authPluginConfig } from "../config";
import { createAuthForRequest } from "../get-auth";
import type { CoreEnv } from "../../config/env";

/**
 * Canonical public JWKS route for this issuer.
 *
 * Better Auth's JWT plugin owns `/jwks` relative to the Better Auth base path,
 * so with issuer/base path `/api/auth`, discovery metadata advertises
 * `/api/auth/jwks`. Do not add `/.well-known/jwks.json` unless a concrete
 * client requires that compatibility route; clients should normally follow
 * `jwks_uri` from OAuth/OIDC discovery.
 */
function publicJwksPath(): string {
  return `${authPluginConfig.issuerPath}${authPluginConfig.jwksPath}`;
}

/** True for the public Better Auth JWKS endpoint mounted by this Worker. */
export function authPathIsJwks(pathname: string): boolean {
  return pathname === publicJwksPath();
}

/**
 * Serve JWKS fresh from Better Auth instead of the Worker Cache API.
 *
 * Better Auth rotates JWT signing keys lazily: the first token signed after
 * `rotationInterval` creates a new private key and emits a new `kid`; the JWKS
 * endpoint then needs to publish that new public key immediately. If the issuer
 * serves a stale edge-cached JWKS, a resource server that correctly refetches on
 * unknown `kid` still receives only the previous key and must reject the fresh
 * token. Rate limiting and resource-server JWKS caching protect cost; issuer
 * caching must be rotation-aware before it is reintroduced.
 */
export async function handleJwks(env: CoreEnv, request: Request, runtime: AuthRuntimeOptions): Promise<Response> {
  const auth = await createAuthForRequest(env, runtime);
  return auth.handler(request);
}
