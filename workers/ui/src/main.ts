import { Hono } from "hono";
import { CORE_HEALTH_PATH } from "@id/lib";
import type { UiEnv } from "@/lib/env";

const app = new Hono<{ Bindings: UiEnv }>();

async function fetchCoreHealth(env: UiEnv) {
  return env.CORE_ID.fetch(`https://core-id.local${CORE_HEALTH_PATH}`);
}

app.get("/health", async (c) => {
  const response = await fetchCoreHealth(c.env);
  return c.json({ coreReachable: response.ok });
});

app.get("/admin", async (c) => {
  const response = await fetchCoreHealth(c.env);
  return c.json({ admin: "id-ui", coreReachable: response.ok });
});

export default app;
