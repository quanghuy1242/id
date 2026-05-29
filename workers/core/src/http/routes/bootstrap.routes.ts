import type { Context, Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { CoreEnv } from "../../config/env";
import { getAuth } from "../../auth/get-auth";
import { nativeAdminExists } from "../../infrastructure/persistence/bootstrap-store";
import { MIN_BOOTSTRAP_PASSWORD_LENGTH, MIN_BOOTSTRAP_TOKEN_LENGTH, BOOTSTRAP_RATE_LIMIT_MAX_ATTEMPTS, BOOTSTRAP_RATE_LIMIT_TTL_SECONDS, BOOTSTRAP_LOCK_TTL_SECONDS } from "../../shared/constants";
import { extractBearerToken } from "../../shared/request";
import { HTTP_BAD_REQUEST, HTTP_FORBIDDEN, HTTP_UNAUTHORIZED, HTTP_TOO_MANY_REQUESTS, HTTP_SERVICE_UNAVAILABLE } from "../../shared/http-status";

/*
 * Bootstrap is an exceptional infrastructure route: it runs before an admin
 * session exists, so it must read the bootstrap secret and raw request body
 * directly instead of using the normal admin actor/use-case pipeline.
 */

const bootstrapAdminBody = z.object({
  email: z.email(),
  password: z.string().min(MIN_BOOTSTRAP_PASSWORD_LENGTH),
  name: z.string().min(1),
  organization: z
    .object({
      name: z.string().min(1),
      slug: z.string().min(1),
    })
    .optional(),
});

type BootstrapContext = Context<{ Bindings: CoreEnv }>;

function safeBearerEquals(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function bootstrapAttemptKey(ip: string): string {
  return `bootstrap:attempts:${ip}`;
}

function bootstrapLockKey(): string {
  return "bootstrap:lock";
}

async function handleBootstrapAdmin(c: BootstrapContext) {
  const env = c.env;
  const expectedToken = env.ID_BOOTSTRAP_TOKEN;
  if (!expectedToken) {
    return c.json({ error: "bootstrap_disabled" }, HTTP_FORBIDDEN);
  }

  if (expectedToken.length < MIN_BOOTSTRAP_TOKEN_LENGTH) {
    return c.json({ error: "bootstrap_token_insufficient_strength", message: `Bootstrap token must be at least ${MIN_BOOTSTRAP_TOKEN_LENGTH} characters` }, HTTP_SERVICE_UNAVAILABLE);
  }

  const clientIp = c.req.header("cf-connecting-ip") ?? "unknown";
  const attemptKey = bootstrapAttemptKey(clientIp);
  const attemptCount = Number((await env.KV.get(attemptKey)) ?? "0");
  if (attemptCount >= BOOTSTRAP_RATE_LIMIT_MAX_ATTEMPTS) {
    return c.json({ error: "too_many_attempts" }, HTTP_TOO_MANY_REQUESTS);
  }

  if (!safeBearerEquals(extractBearerToken(c.req.header("authorization") ?? null), expectedToken)) {
    await env.KV.put(attemptKey, String(attemptCount + 1), { expirationTtl: BOOTSTRAP_RATE_LIMIT_TTL_SECONDS });
    return c.json({ error: "unauthorized" }, HTTP_UNAUTHORIZED);
  }

  if (await nativeAdminExists(env.DB)) {
    return c.json({ error: "bootstrap_already_completed" }, HTTP_FORBIDDEN);
  }

  const lockKey = bootstrapLockKey();
  const existingLock = await env.KV.get(lockKey);
  if (existingLock) {
    return c.json({ error: "bootstrap_in_progress" }, HTTP_FORBIDDEN);
  }
  await env.KV.put(lockKey, "1", { expirationTtl: BOOTSTRAP_LOCK_TTL_SECONDS });

  const body = bootstrapAdminBody.safeParse(await c.req.raw.json().catch(() => null));
  if (!body.success) {
    await env.KV.delete(lockKey);
    return c.json({ error: "invalid_bootstrap_request" }, HTTP_BAD_REQUEST);
  }

  const auth = getAuth(env);
  try {
    const created = await auth.api.createUser({
      body: {
        email: body.data.email,
        password: body.data.password,
        name: body.data.name,
        role: "admin",
        data: { emailVerified: true },
      },
    });

    if (body.data.organization) {
      await auth.api.createOrganization({
        body: {
          name: body.data.organization.name,
          slug: body.data.organization.slug,
          userId: created.user.id,
        },
      });
    }

    return c.json({
      user: {
        id: created.user.id,
        email: created.user.email,
        role: created.user.role,
      },
      bootstrap: "completed",
    });
  } finally {
    await env.KV.delete(lockKey);
  }
}

export function registerBootstrapRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.post("/api/bootstrap/admin", (c) => handleBootstrapAdmin(c));
}
