import type { Hono } from "hono";
import type { CoreEnv } from "../../config/env";
import { resolveAuthRuntime } from "../../composition/resolve-auth-runtime";
import { authPathIsJwks, handleJwks } from "../../auth/adapters/jwks";
import { authPathIsWellKnown, handleWellKnown } from "../../auth/adapters/well-known";
import { authPathNeedsResourceAudiences, createAuthForRequest } from "../../auth/get-auth";

export function registerAuthRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.all("/api/auth/*", async (c) => {
    const runtime = resolveAuthRuntime(c);
    const requestUrl = new URL(c.req.url);

    if (c.req.method === "GET") {
      /**
       * Public discovery/JWKS routes need app-level routing decisions before
       * the generic Better Auth handler. JWKS is a normal BA route under
       * `/api/auth`; OAuth/OIDC metadata is SERVER_ONLY inside oauth-provider
       * and must be bridged through the adapter helpers.
       */
      if (authPathIsJwks(requestUrl.pathname)) {
        return handleJwks(c.env, c.req.raw, runtime);
      }

      if (authPathIsWellKnown(requestUrl.pathname)) {
        const auth = await createAuthForRequest(c.env, runtime);
        return handleWellKnown(auth, c.req.raw);
      }
    }

    const auth = await createAuthForRequest(c.env, runtime, {
      loadResourceAudiences: authPathNeedsResourceAudiences(requestUrl.pathname),
    });
    return auth.handler(c.req.raw);
  });
}

export function registerWellKnownRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.get("/.well-known/oauth-authorization-server", async (c) => {
    const auth = await createAuthForRequest(c.env, resolveAuthRuntime(c));
    return handleWellKnown(auth, c.req.raw);
  });
  app.get("/.well-known/oauth-authorization-server/api/auth", async (c) => {
    const auth = await createAuthForRequest(c.env, resolveAuthRuntime(c));
    return handleWellKnown(auth, c.req.raw);
  });
  app.get("/.well-known/openid-configuration", async (c) => {
    const auth = await createAuthForRequest(c.env, resolveAuthRuntime(c));
    return handleWellKnown(auth, c.req.raw);
  });
  app.get("/.well-known/openid-configuration/api/auth", async (c) => {
    const auth = await createAuthForRequest(c.env, resolveAuthRuntime(c));
    return handleWellKnown(auth, c.req.raw);
  });
}
