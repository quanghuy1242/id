import { Hono } from "hono";
import type { CoreEnv } from "../config/env";
import { registerHealthRoute } from "../http/routes/health.routes";
import {
  registerAuthRoutes,
  registerWellKnownRoutes,
} from "../http/routes/auth-mount";
import { registerBootstrapRoutes } from "../http/routes/bootstrap.routes";

export function createApp() {
  const app = new Hono<{ Bindings: CoreEnv }>();

  registerHealthRoute(app);
  registerBootstrapRoutes(app);
  registerAuthRoutes(app);
  registerWellKnownRoutes(app);

  return app;
}
