import { Hono } from "hono";
import type { UiEnv } from "@/lib/env";

const app = new Hono<{ Bindings: UiEnv }>();

app.get("/health", async (c) => {
  const response = await c.env.CORE_ID.fetch("https://core-id.local/health");
  return c.json({ coreReachable: response.ok });
});

export default app;
