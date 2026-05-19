import { OpenAPIHono } from "@hono/zod-openapi";
import { getAuth } from "./auth/get-auth";
import type { CoreEnv } from "./config/env";

export function createApp() {
  const app = new OpenAPIHono<{ Bindings: CoreEnv }>();

  app.get("/health", (c) => c.json({ ok: true, service: "id-core" }, 200));
  app.all("/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

  return app;
}
