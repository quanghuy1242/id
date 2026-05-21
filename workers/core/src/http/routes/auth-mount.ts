import type { Hono } from "hono";
import type { CoreEnv } from "../../config/env";
import { authPathNeedsResourceAudiences, createAuthForRequest } from "../../auth/get-auth";
import type { AuthRuntimeOptions } from "../../auth/types";
import { authPathIsJwks, withJwksCache } from "../../auth/adapters/jwks-cache";

export function registerAuthRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.all("/api/auth/*", async (c) => {
    let runtime: AuthRuntimeOptions = {};
    try {
      const executionCtx = c.executionCtx;
      runtime = {
        backgroundTaskRunner: {
          waitUntil: (task) => executionCtx.waitUntil(task),
        },
      };
    } catch {
      // Hono unit tests do not always provide a Worker ExecutionContext.
    }

    const requestUrl = new URL(c.req.url);
    if (c.req.method === "GET" && authPathIsJwks(requestUrl.pathname)) {
      return withJwksCache(c.req.raw, runtime, async () => {
        const auth = await createAuthForRequest(c.env, runtime);
        return auth.handler(c.req.raw);
      });
    }

    const auth = await createAuthForRequest(c.env, runtime, {
      // Only resource-validating OAuth routes should pay audience cache/D1 cost.
      loadResourceAudiences: authPathNeedsResourceAudiences(requestUrl.pathname),
    });
    return auth.handler(c.req.raw);
  });
}

async function handleWellKnownAlias(env: CoreEnv, request: Request, path: string): Promise<Response> {
  const auth = await createAuthForRequest(env);
  const url = new URL(request.url);
  url.pathname = path;
  return auth.handler(new Request(url, request));
}

export function registerWellKnownRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.all("/.well-known/oauth-authorization-server", async (c) => {
    return handleWellKnownAlias(c.env, c.req.raw, "/api/auth/.well-known/oauth-authorization-server");
  });
  app.all("/.well-known/oauth-authorization-server/api/auth", async (c) => {
    return handleWellKnownAlias(c.env, c.req.raw, "/api/auth/.well-known/oauth-authorization-server");
  });
  app.all("/.well-known/openid-configuration", async (c) => {
    return handleWellKnownAlias(c.env, c.req.raw, "/api/auth/.well-known/openid-configuration");
  });
  app.all("/.well-known/openid-configuration/api/auth", async (c) => {
    return handleWellKnownAlias(c.env, c.req.raw, "/api/auth/.well-known/openid-configuration");
  });
}
