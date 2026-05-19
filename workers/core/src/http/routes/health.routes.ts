import type { Hono } from "hono";
import type { CoreEnv } from "../../config/env";
import { HTTP_OK } from "../../shared/http-status";

export function registerHealthRoute(app: Hono<{ Bindings: CoreEnv }>) {
  app.get("/health", (c) => c.json({ ok: true, service: "id-core" }, HTTP_OK));
}
