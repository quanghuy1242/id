import type { Hono } from "hono";
import type { CoreEnv } from "../../config/env";
import { createAuthForRequest } from "../../auth/get-auth";

export function registerAuthRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.all("/api/auth/*", async (c) => {
    const auth = await createAuthForRequest(c.env, {
      backgroundTaskRunner: {
        waitUntil: (task) => c.executionCtx.waitUntil(task),
      },
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
