import { Hono } from "hono";
import { ADMIN_API_PROXY_PREFIX, CORE_HEALTH_PATH } from "@id/lib";
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

app.all(`${ADMIN_API_PROXY_PREFIX}/*`, async (c) => {
  const url = new URL(c.req.url);
  const corePath = url.pathname.slice(ADMIN_API_PROXY_PREFIX.length);
  url.hostname = "core-id.local";
  url.protocol = "https:";
  url.pathname = `/api/admin${corePath}`;
  return c.env.CORE_ID.fetch(new Request(url, c.req.raw));
});

export default app;
