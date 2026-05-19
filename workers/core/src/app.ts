import { OpenAPIHono } from "@hono/zod-openapi";

export function createApp() {
  const app = new OpenAPIHono();

  app.get("/health", (c) => c.json({ ok: true, service: "id-core" }, 200));

  return app;
}
