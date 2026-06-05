import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";
import { applyAuthMigrations, type RawSqlite } from "./d1-test-helper";
import { createCapturedAuthEmailSender } from "../helpers/test-email";
import { adminOtpSignIn } from "./admin-otp-sign-in";

const capturedEmailSender = createCapturedAuthEmailSender();

const BASE = "https://id.example.test";
type OpenApiObjectSchema = {
  readonly $defs?: Record<string, OpenApiObjectSchema>;
  readonly $ref?: string;
  readonly items?: OpenApiObjectSchema;
  readonly properties?: Record<string, OpenApiObjectSchema>;
};
type OpenApiMedia = {
  readonly "application/json"?: { readonly schema?: OpenApiObjectSchema };
};
type OpenApiOperation = {
  readonly parameters?: Array<{ readonly name?: string; readonly in?: string }>;
  readonly requestBody?: { readonly content?: OpenApiMedia };
  readonly responses?: Record<string, { readonly content?: OpenApiMedia }>;
};
type OpenApiSchema = {
  readonly paths: Record<
    string,
    {
      readonly get?: OpenApiOperation;
      readonly post?: OpenApiOperation;
    }
  >;
};

function createKv(): BetterAuthKvStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

async function createAuth(raw: RawSqlite) {
  const db = drizzleAdapter(drizzle(raw), {
    provider: "sqlite",
    camelCase: true,
    schema: authSchema,
  });
  return betterAuth(
    getAuthOptions(
      {
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: BASE,
        DB: db,
        KV: createKv(),
      },
      { validAudiences: [], scopes: [], scopeRows: [] },
      { emailSender: capturedEmailSender },
    ),
  );
}

type TestAuth = Awaited<ReturnType<typeof createAuth>>;

async function createMemoryDatabase(): Promise<RawSqlite> {
  const { default: Database } = (await import("better-sqlite3")) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  applyAuthMigrations(raw);
  raw.exec(
    `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`,
  );
  return raw;
}

async function signInSuperadmin(auth: TestAuth): Promise<string> {
  await auth.api.createUser({
    body: {
      name: "Admin",
      email: "admin@example.test",
      password: "password123",
      role: "admin",
      data: { emailVerified: true },
    },
  });
  const r = await adminOtpSignIn(auth, capturedEmailSender, {
    email: "admin@example.test",
    password: "password123",
  });
  return r.headers.get("set-cookie") ?? "";
}

async function signInRegularUser(auth: TestAuth): Promise<string> {
  // All sign-ins flow through the admin-OTP guard; a default-role user signed
  // in this way still carries role "user", so the audit endpoints must 403.
  await auth.api.createUser({
    body: {
      name: "Joe",
      email: "joe@example.test",
      password: "password123",
      data: { emailVerified: true },
    },
  });
  const r = await adminOtpSignIn(auth, capturedEmailSender, {
    email: "joe@example.test",
    password: "password123",
  });
  return r.headers.get("set-cookie") ?? "";
}

function seedAuditData(raw: RawSqlite): void {
  // A user to enrich session/token/consent rows by email.
  raw.exec(
    `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('u_seed','Seed','seed@example.test',1,1700000000000,1700000000000);`,
  );
  // An OAuth client to enrich tokens/consents by name.
  raw.exec(
    `insert into "oauthClient" ("id","clientId","name","redirectUris","createdAt","updatedAt") values ('oc_1','cli_seed','Content API','[]',1700000000000,1700000000000);`,
  );
  // A session for u_seed.
  raw.exec(
    `insert into "session" ("id","token","userId","expiresAt","createdAt","updatedAt","ipAddress") values ('sess_seed','tok_session_secret','u_seed',1900000000000,1700000000000,1700000000000,'1.2.3.4');`,
  );
  // An access token (token value must never be returned).
  raw.exec(
    `insert into "oauthAccessToken" ("id","token","clientId","userId","scopes","expiresAt","createdAt") values ('at_1','SECRET_ACCESS_TOKEN_VALUE','cli_seed','u_seed','["content:read"]',1900000000000,1700000000000);`,
  );
  // A consent grant.
  raw.exec(
    `insert into "oauthConsent" ("id","clientId","userId","scopes","createdAt","updatedAt") values ('cons_1','cli_seed','u_seed','["openid","profile"]',1700000000000,1700000000000);`,
  );
}

describe("admin-audit plugin", () => {
  it("exports the safe session contract in OpenAPI", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);

    const r = await auth.handler(
      new Request(`${BASE}/api/auth/open-api/generate-schema`, {
        method: "GET",
      }),
    );
    expect(r.status).toBe(200);
    const schema = (await r.json()) as OpenApiSchema;
    const listSessions = schema.paths["/admin/list-sessions"]?.get;
    const responseSchema =
      listSessions?.responses?.["200"]?.content?.["application/json"]?.schema;
    const sessionItem = responseSchema?.properties?.sessions?.items;
    const sessionSchema =
      sessionItem?.$ref === "#/$defs/AdminAuditSession"
        ? responseSchema?.$defs?.AdminAuditSession
        : sessionItem;
    const sessionProps = sessionSchema?.properties ?? {};
    expect(listSessions?.parameters).toContainEqual(
      expect.objectContaining({ name: "userId", in: "query" }),
    );
    expect(sessionProps).toHaveProperty("id");
    expect(sessionProps).toHaveProperty("activeOrganizationId");
    expect(sessionProps).not.toHaveProperty("token");

    const revokeSessionProps =
      schema.paths["/admin/revoke-session"]?.post?.requestBody?.content?.[
        "application/json"
      ]?.schema?.properties ?? {};
    expect(revokeSessionProps).toHaveProperty("sessionId");
    expect(revokeSessionProps).not.toHaveProperty("sessionToken");
  });

  it("rejects unauthenticated and non-admin callers", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);

    const anon = await auth.handler(
      new Request(`${BASE}/api/auth/admin/list-sessions`, { method: "GET" }),
    );
    expect(anon.status).toBeGreaterThanOrEqual(400);

    const userCookie = await signInRegularUser(auth);
    const forbidden = await auth.handler(
      new Request(`${BASE}/api/auth/admin/list-sessions`, {
        method: "GET",
        headers: { cookie: userCookie },
      }),
    );
    expect(forbidden.status).toBe(403);
  });

  it("lists sessions with pagination total and enriched email", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);
    seedAuditData(raw);

    const r = await auth.handler(
      new Request(
        `${BASE}/api/auth/admin/list-sessions?limit=10&offset=0&userId=u_seed`,
        { method: "GET", headers: { cookie } },
      ),
    );
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain("tok_session_secret");
    const body = JSON.parse(text) as {
      sessions: Array<{
        userId: string;
        userEmail: string | null;
        activeOrganizationId: string | null;
        activeTeamId: string | null;
      }>;
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.limit).toBe(10);
    expect(typeof body.total).toBe("number");
    // The seeded session resolves its user email via the batched `in` lookup.
    const seeded = body.sessions.find((s) => s.userId === "u_seed");
    expect(seeded?.userEmail).toBe("seed@example.test");
    expect(seeded).not.toHaveProperty("token");
  });

  it("revokes a browser session by id without accepting the token from the caller", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);
    seedAuditData(raw);

    const revoke = await auth.handler(
      new Request(`${BASE}/api/auth/admin/revoke-session`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "sess_seed" }),
      }),
    );
    expect(revoke.status).toBe(200);
    expect(await revoke.json()).toEqual({ success: true });

    const after = await auth.handler(
      new Request(
        `${BASE}/api/auth/admin/list-sessions?limit=10&offset=0&userId=u_seed`,
        { method: "GET", headers: { cookie } },
      ),
    );
    expect(after.status).toBe(200);
    const afterBody = (await after.json()) as {
      sessions: unknown[];
      total: number;
    };
    expect(afterBody.sessions).toEqual([]);
    expect(afterBody.total).toBe(0);
  });

  it("lists tokens without ever returning the token value", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);
    seedAuditData(raw);

    const r = await auth.handler(
      new Request(`${BASE}/api/auth/admin/list-tokens?type=access`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain("SECRET_ACCESS_TOKEN_VALUE");
    const body = JSON.parse(text) as {
      tokens: Array<{
        tokenPrefix: string;
        clientName: string | null;
        type: string;
      }>;
    };
    const token = body.tokens.find((t) => t.clientName === "Content API");
    expect(token?.tokenPrefix).toBe("SECRET_A…");
    expect(token?.type).toBe("access");
  });

  it("lists consents and revokes one", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);
    seedAuditData(raw);

    const list = await auth.handler(
      new Request(`${BASE}/api/auth/admin/list-consents`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      consents: Array<{ clientId: string; userEmail: string | null }>;
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.consents[0]?.userEmail).toBe("seed@example.test");

    const revoke = await auth.handler(
      new Request(`${BASE}/api/auth/admin/revoke-consent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ clientId: "cli_seed", userId: "u_seed" }),
      }),
    );
    expect(revoke.status).toBe(200);
    expect(await revoke.json()).toEqual({ success: true });

    const after = await auth.handler(
      new Request(`${BASE}/api/auth/admin/list-consents`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    const afterBody = (await after.json()) as { total: number };
    expect(afterBody.total).toBe(0);
  });

  it("returns JWKS metadata without the private key", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);
    // Trigger key creation by hitting the public JWKS endpoint first.
    await auth.handler(new Request(`${BASE}/api/auth/jwks`, { method: "GET" }));

    const r = await auth.handler(
      new Request(`${BASE}/api/auth/admin/jwks`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain("privateKey");
    const body = JSON.parse(text) as {
      keys: Array<{
        id: string;
        status: string;
        publicJwk: Record<string, unknown>;
      }>;
    };
    expect(body.keys.length).toBeGreaterThanOrEqual(1);
    expect(body.keys[0].status).toBe("active");
    expect(body.keys[0].publicJwk).not.toHaveProperty("d"); // Ed25519 private scalar
  });

  it("emergency-rotates JWKS and records public-only activity", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);

    const rotate = await auth.handler(
      new Request(`${BASE}/api/auth/admin/jwks/rotate`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ reason: "compromise drill" }),
      }),
    );
    expect(rotate.status).toBe(200);
    const rotatedText = await rotate.text();
    expect(rotatedText).not.toContain("privateKey");
    expect(rotatedText).not.toContain('"d"');
    const rotated = JSON.parse(rotatedText) as {
      id: string;
      publicJwk: Record<string, unknown>;
      reason: string;
    };
    expect(rotated.reason).toBe("compromise drill");
    expect(rotated.publicJwk).not.toHaveProperty("d");

    const list = await auth.handler(
      new Request(
        `${BASE}/api/auth/admin/activity-log?targetType=jwks&targetId=${rotated.id}`,
        {
          method: "GET",
          headers: { cookie },
        },
      ),
    );
    expect(list.status).toBe(200);
    const activityText = await list.text();
    expect(activityText).toContain("jwks.rotate");
    expect(activityText).not.toContain("privateKey");
    expect(activityText).not.toContain('"d"');
  });
});
