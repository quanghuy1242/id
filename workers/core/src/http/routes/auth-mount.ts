import type { Hono } from "hono";
import type { CoreEnv } from "../../config/env";
import { getAuth } from "../../auth/get-auth";
import { loadResourceAudiences } from "../../auth/adapters/audiences";
import { loadEnabledResourceAudienceRows } from "../../infrastructure/persistence/resource-server-store";

export function registerAuthRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.all("/api/auth/*", async (c) => {
    const loaded = await loadResourceAudiences(c.env.KV, () => loadEnabledResourceAudienceRows(c.env.DB));
    const auth = getAuth(c.env, loaded.audiences);
    return auth.handler(c.req.raw);
  });
}

export function registerWellKnownRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.all("/.well-known/oauth-authorization-server", async (c) => {
    const loaded = await loadResourceAudiences(c.env.KV, () => loadEnabledResourceAudienceRows(c.env.DB));
    const auth = getAuth(c.env, loaded.audiences);
    const url = new URL(c.req.url);
    url.pathname = "/api/auth/.well-known/oauth-authorization-server";
    return auth.handler(new Request(url, c.req.raw));
  });
  app.all("/.well-known/oauth-authorization-server/api/auth", async (c) => {
    const loaded = await loadResourceAudiences(c.env.KV, () => loadEnabledResourceAudienceRows(c.env.DB));
    const auth = getAuth(c.env, loaded.audiences);
    const url = new URL(c.req.url);
    url.pathname = "/api/auth/.well-known/oauth-authorization-server";
    return auth.handler(new Request(url, c.req.raw));
  });
  app.all("/.well-known/openid-configuration", async (c) => {
    const loaded = await loadResourceAudiences(c.env.KV, () => loadEnabledResourceAudienceRows(c.env.DB));
    const auth = getAuth(c.env, loaded.audiences);
    const url = new URL(c.req.url);
    url.pathname = "/api/auth/.well-known/openid-configuration";
    return auth.handler(new Request(url, c.req.raw));
  });
  app.all("/.well-known/openid-configuration/api/auth", async (c) => {
    const loaded = await loadResourceAudiences(c.env.KV, () => loadEnabledResourceAudienceRows(c.env.DB));
    const auth = getAuth(c.env, loaded.audiences);
    const url = new URL(c.req.url);
    url.pathname = "/api/auth/.well-known/openid-configuration";
    return auth.handler(new Request(url, c.req.raw));
  });
}
