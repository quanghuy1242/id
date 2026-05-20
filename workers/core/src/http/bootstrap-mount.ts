import { Hono } from "hono";
import { z } from "zod";
import type { CoreEnv } from "../config/env";
import { getAuth } from "../auth/get-auth";
import { nativeAdminExists } from "../infrastructure/persistence/bootstrap-store";
import { MIN_BOOTSTRAP_PASSWORD_LENGTH } from "../shared/constants";
import { HTTP_BAD_REQUEST, HTTP_FORBIDDEN, HTTP_UNAUTHORIZED } from "../shared/http-status";

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

function bearerToken(header: string | null): string | null {
  const prefix = "Bearer ";
  return header?.startsWith(prefix) ? header.slice(prefix.length) : null;
}

export function registerBootstrapRoutes(app: Hono<{ Bindings: CoreEnv }>) {
  app.post("/api/bootstrap/admin", async (c) => {
    const env = c.env;
    const expectedToken = env.ID_BOOTSTRAP_TOKEN;
    if (!expectedToken) {
      return c.json({ error: "bootstrap_disabled" }, HTTP_FORBIDDEN);
    }

    if (bearerToken(c.req.header("authorization") ?? null) !== expectedToken) {
      return c.json({ error: "unauthorized" }, HTTP_UNAUTHORIZED);
    }

    if (await nativeAdminExists(env.DB)) {
      return c.json({ error: "bootstrap_already_completed" }, HTTP_FORBIDDEN);
    }

    const body = bootstrapAdminBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "invalid_bootstrap_request" }, HTTP_BAD_REQUEST);
    }

    const auth = getAuth(env);
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
  });
}
