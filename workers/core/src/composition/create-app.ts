import { Hono } from "hono";
import type { CoreEnv } from "../config/env";
import { registerHealthRoute } from "../http/routes/health.routes";
import { registerAuthRoutes, registerWellKnownRoutes } from "../http/routes/auth-mount";

export function createApp() {
  const app = new Hono<{ Bindings: CoreEnv }>();

  registerHealthRoute(app);
  registerAuthRoutes(app);
  registerWellKnownRoutes(app);

  return app;
}
