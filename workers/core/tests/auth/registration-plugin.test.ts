import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAuth } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import type { CoreEnv } from "../../src/config/env";
import { createCapturedAuthEmailSender } from "../helpers/test-email";
import { adminOtpSignIn } from "./admin-otp-sign-in";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";

type TestAuth = ReturnType<typeof getAuth>;

type OAuthAdminApi = {
  readonly adminCreateOAuthClient: (params: {
    readonly headers: Headers;
    readonly body: Record<string, unknown>;
  }) => Promise<{ readonly client_id: string; readonly client_secret?: string }>;
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

async function createHarness(): Promise<{
  readonly auth: TestAuth;
  readonly raw: RawSqlite;
  readonly emailSender: ReturnType<typeof createCapturedAuthEmailSender>;
}> {
  const { db, raw } = await createMemoryD1();
  const emailSender = createCapturedAuthEmailSender();
  const env: CoreEnv = {
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "https://id.example.test",
    DB: db,
    KV: createKv(),
  };
  raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_reg', 'Registration Org', 'registration-org', 1700000000000);`);
  return {
    raw,
    emailSender,
    auth: getAuth(env, undefined, { emailSender }),
  };
}

async function signInAdmin(auth: TestAuth, emailSender: ReturnType<typeof createCapturedAuthEmailSender>): Promise<string> {
  await auth.api.createUser({
    body: {
      name: "Root Admin",
      email: "root@example.test",
      password: "password12345",
      role: "admin",
      data: { emailVerified: true },
    },
  });
  const response = await adminOtpSignIn(auth, emailSender, {
    email: "root@example.test",
    password: "password12345",
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie") ?? "";
}

async function createOAuthClient(auth: TestAuth, cookie: string): Promise<string> {
  const api = auth.api as unknown as OAuthAdminApi;
  const client = await api.adminCreateOAuthClient({
    headers: new Headers({ cookie }),
    body: {
      client_name: "content-ui",
      redirect_uris: ["https://app.example.test/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: "openid profile email",
      type: "native",
      require_pkce: true,
      skip_consent: true,
    },
  });
  return client.client_id;
}

async function createEnabledPolicy(auth: TestAuth, cookie: string, clientId: string): Promise<string> {
  const create = await auth.handler(
    new Request("https://id.example.test/api/auth/admin/registration-policies", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        slug: "content-beta",
        name: "Content beta",
        mode: "client_initiated",
        clientId,
        organizationId: "org_reg",
        allowedScopes: ["openid", "profile", "email"],
        emailDomains: ["example.test"],
        defaultRole: "member",
        defaultTeamIds: [],
        quotaLimit: 1,
        quotaTarget: "memberships",
        requiresEmailVerification: true,
      }),
    }),
  );
  expect(create.status).toBe(200);
  const created = (await create.json()) as { readonly id: string };

  const enable = await auth.handler(
    new Request(`https://id.example.test/api/auth/admin/registration-policies/${created.id}/enable`, {
      method: "POST",
      headers: { cookie },
    }),
  );
  expect(enable.status).toBe(200);
  return created.id;
}

async function createInviteOnlyPolicy(auth: TestAuth, cookie: string): Promise<string> {
  const create = await auth.handler(
    new Request("https://id.example.test/api/auth/admin/registration-policies", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        slug: "invite-only",
        name: "Invite only",
        mode: "invite_only",
        organizationId: "org_reg",
        allowedScopes: [],
        emailDomains: ["example.test"],
        defaultRole: "member",
        defaultTeamIds: [],
        quotaLimit: 5,
        quotaTarget: "memberships",
        requiresEmailVerification: true,
      }),
    }),
  );
  expect(create.status).toBe(200);
  const created = (await create.json()) as { readonly id: string };
  const enable = await auth.handler(
    new Request(`https://id.example.test/api/auth/admin/registration-policies/${created.id}/enable`, {
      method: "POST",
      headers: { cookie },
    }),
  );
  expect(enable.status).toBe(200);
  return created.id;
}

function createInvitation(raw: RawSqlite, email = "invitee@example.test"): string {
  const invitationId = `inv_${email.replace(/[^a-z0-9]/giu, "_")}`;
  const inviter = raw.prepare(`select "id" from "user" where "email" = ?`).get("root@example.test") as { readonly id: string };
  raw.prepare(`
    insert into "invitation" ("id", "organizationId", "email", "role", "teamId", "status", "expiresAt", "createdAt", "inviterId")
    values (?, 'org_reg', ?, 'member', null, 'pending', ?, ?, ?)
  `).run(invitationId, email, Date.now() + 86_400_000, Date.now(), inviter.id);
  return invitationId;
}

function codeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function authorizeQuery(clientId: string, verifier = codeVerifier()): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "https://app.example.test/callback",
    scope: "openid profile email",
    state: "registration-state",
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "create",
  });
  return query.toString();
}

async function signedAuthorizeQuery(auth: TestAuth, clientId: string, verifier = codeVerifier()): Promise<string> {
  const authorize = await auth.handler(
    new Request(`https://id.example.test/api/auth/oauth2/authorize?${authorizeQuery(clientId, verifier)}`),
  );
  expect(authorize.status).toBe(302);
  const registerUrl = new URL(authorize.headers.get("location") ?? "", "https://id.example.test");
  expect(registerUrl.pathname).toBe("/register");
  return registerUrl.searchParams.toString();
}

function userCount(raw: RawSqlite, email: string): number {
  const row = raw.prepare(`select count(*) as n from "user" where "email" = ?`).get(email) as { readonly n: number };
  return row.n;
}

describe("idRegistration plugin", () => {
  it("keeps direct public signup fail-closed after Better Auth signup is enabled", async () => {
    const { auth, raw } = await createHarness();
    const response = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "No Intent",
          email: "no-intent@example.test",
          password: "password12345",
        }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "missing_registration_intent" });
    expect(userCount(raw, "no-intent@example.test")).toBe(0);
  });

  it("evaluates policy, reserves soft quota, lets BA create the user, and applies least-privilege org membership", async () => {
    const { auth, raw, emailSender } = await createHarness();
    const cookie = await signInAdmin(auth, emailSender);
    const clientId = await createOAuthClient(auth, cookie);
    const policyId = await createEnabledPolicy(auth, cookie, clientId);

    const denied = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oauthQuery: authorizeQuery(clientId) }),
      }),
    );
    expect(denied.status).toBe(200);
    await expect(denied.json()).resolves.toMatchObject({ decision: "denied", reason: "invalid_oauth_query" });
    const intentCount = raw.prepare(`select count(*) as n from "registrationIntent"`).get() as { readonly n: number };
    expect(intentCount.n).toBe(0);

    const oauthQuery = await signedAuthorizeQuery(auth, clientId);
    const evaluate = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oauthQuery }),
      }),
    );
    expect(evaluate.status).toBe(200);
    const decision = (await evaluate.json()) as { readonly decision: "allowed"; readonly intentId: string; readonly allowedScopes: string[] };
    expect(decision).toEqual(expect.objectContaining({ decision: "allowed", allowedScopes: ["openid", "profile", "email"] }));

    const submit = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intentId: decision.intentId,
          name: "New User",
          email: "new-user@example.test",
          password: "password12345",
        }),
      }),
    );
    expect(submit.status).toBe(200);
    await expect(submit.json()).resolves.toMatchObject({ status: "ready", intentId: decision.intentId });

    const signup = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-id-registration-intent": decision.intentId },
        body: JSON.stringify({
          name: "New User",
          email: "new-user@example.test",
          password: "password12345",
        }),
      }),
    );
    expect(signup.status).toBe(200);
    expect(userCount(raw, "new-user@example.test")).toBe(1);
    const membership = raw.prepare(`select "role" from "member" where "organizationId" = 'org_reg'`).get() as { readonly role: string };
    expect(membership.role).toBe("member");
    const intent = raw.prepare(`select "status", "userId" from "registrationIntent" where "id" = ?`).get(decision.intentId) as { readonly status: string; readonly userId: string };
    expect(intent).toEqual(expect.objectContaining({ status: "completed", userId: expect.any(String) }));

    const quota = await auth.handler(
      new Request(`https://id.example.test/api/auth/admin/registration-policies/${policyId}/quota`, {
        headers: { cookie },
      }),
    );
    expect(quota.status).toBe(200);
    await expect(quota.json()).resolves.toMatchObject({ quotaLimit: 1, quotaUsed: 1, quotaReserved: 0 });
  });

  it("proves the OAuth Provider prompt=create signup contract and created continuation", async () => {
    const { auth, raw, emailSender } = await createHarness();
    const cookie = await signInAdmin(auth, emailSender);
    const clientId = await createOAuthClient(auth, cookie);
    await createEnabledPolicy(auth, cookie, clientId);
    const verifier = codeVerifier();

    const oauthQuery = await signedAuthorizeQuery(auth, clientId, verifier);

    const evaluate = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oauthQuery }),
      }),
    );
    const decision = (await evaluate.json()) as { readonly intentId: string };
    await auth.handler(
      new Request("https://id.example.test/api/auth/registration/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intentId: decision.intentId,
          name: "Created User",
          email: "created@example.test",
          password: "password12345",
        }),
      }),
    );
    const signup = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-id-registration-intent": decision.intentId },
        body: JSON.stringify({ name: "Created User", email: "created@example.test", password: "password12345" }),
      }),
    );
    expect(signup.status).toBe(200);
    raw.exec(`update "user" set "emailVerified" = 1 where "email" = 'created@example.test';`);
    const signIn = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "created@example.test",
          password: "password12345",
          callbackURL: "/account",
        }),
      }),
    );
    expect(signIn.status).toBe(200);
    const signupCookie = signIn.headers.get("set-cookie") ?? "";

    const continued = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/continue", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: signupCookie },
        body: JSON.stringify({ created: true, oauth_query: oauthQuery }),
      }),
    );
    expect(continued.status).toBe(200);
    const body = (await continued.json()) as { readonly url: string };
    const callback = new URL(body.url);
    expect(callback.origin).toBe("https://app.example.test");
    expect(callback.searchParams.get("state")).toBe("registration-state");
    expect(callback.searchParams.get("code")).toEqual(expect.any(String));
  });

  it("expires and invalidates active intents before account creation while releasing quota reservations", async () => {
    const { auth, raw, emailSender } = await createHarness();
    const cookie = await signInAdmin(auth, emailSender);
    const clientId = await createOAuthClient(auth, cookie);
    const policyId = await createEnabledPolicy(auth, cookie, clientId);
    const oauthQuery = await signedAuthorizeQuery(auth, clientId);

    const evaluate = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oauthQuery }),
      }),
    );
    const decision = (await evaluate.json()) as { readonly intentId: string };
    const submit = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intentId: decision.intentId, name: "Soon Expired", email: "soon-expired@example.test", password: "password12345" }),
      }),
    );
    expect(submit.status).toBe(200);
    raw.exec(`update "registrationIntent" set "expiresAt" = 1 where "id" = '${decision.intentId}';`);
    raw.exec(`update "registrationQuotaReservation" set "expiresAt" = 1 where "intentId" = '${decision.intentId}';`);

    const status = await auth.handler(
      new Request(`https://id.example.test/api/auth/registration/status?intentId=${decision.intentId}`),
    );
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({ status: "expired", failureReason: "expired" });

    const released = raw.prepare(`select "status" from "registrationQuotaReservation" where "intentId" = ?`).get(decision.intentId) as { readonly status: string };
    expect(released.status).toBe("released");

    const secondQuery = await signedAuthorizeQuery(auth, clientId);
    const secondEvaluate = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oauthQuery: secondQuery }),
      }),
    );
    const secondDecision = (await secondEvaluate.json()) as { readonly intentId: string };
    await auth.handler(
      new Request("https://id.example.test/api/auth/registration/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intentId: secondDecision.intentId, name: "Paused", email: "paused@example.test", password: "password12345" }),
      }),
    );

    const pause = await auth.handler(
      new Request(`https://id.example.test/api/auth/admin/registration-policies/${policyId}/pause`, {
        method: "POST",
        headers: { cookie },
      }),
    );
    expect(pause.status).toBe(200);
    const signup = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-id-registration-intent": secondDecision.intentId },
        body: JSON.stringify({ name: "Paused", email: "paused@example.test", password: "password12345" }),
      }),
    );
    expect(signup.status).toBe(400);
    await expect(signup.json()).resolves.toMatchObject({ code: "registration_intent_used" });
    expect(userCount(raw, "paused@example.test")).toBe(0);
  });

  it("records OAuth continuation failure without blocking retry state", async () => {
    const { auth, raw, emailSender } = await createHarness();
    const cookie = await signInAdmin(auth, emailSender);
    const clientId = await createOAuthClient(auth, cookie);
    await createEnabledPolicy(auth, cookie, clientId);
    const oauthQuery = await signedAuthorizeQuery(auth, clientId);
    const evaluate = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oauthQuery }),
      }),
    );
    const decision = (await evaluate.json()) as { readonly intentId: string };
    await auth.handler(new Request("https://id.example.test/api/auth/registration/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intentId: decision.intentId, name: "Retry User", email: "retry@example.test", password: "password12345" }),
    }));
    const signup = await auth.handler(new Request("https://id.example.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-id-registration-intent": decision.intentId },
      body: JSON.stringify({ name: "Retry User", email: "retry@example.test", password: "password12345" }),
    }));
    expect(signup.status).toBe(200);
    raw.exec(`update "user" set "emailVerified" = 1 where "email" = 'retry@example.test';`);

    const mark = await auth.handler(new Request("https://id.example.test/api/auth/registration/continuation-failed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intentId: decision.intentId, reason: "test_failure" }),
    }));
    expect(mark.status).toBe(200);
    const status = await auth.handler(new Request(`https://id.example.test/api/auth/registration/status?intentId=${decision.intentId}`));
    await expect(status.json()).resolves.toMatchObject({
      status: "continuation_failed",
      failureReason: "test_failure",
      canRetryOAuthContinuation: true,
    });
  });

  it("creates an invited account only for the invitation email and accepts the Better Auth organization invitation", async () => {
    const { auth, raw, emailSender } = await createHarness();
    const cookie = await signInAdmin(auth, emailSender);
    await createInviteOnlyPolicy(auth, cookie);
    const invitationId = createInvitation(raw);

    const evaluate = await auth.handler(
      new Request("https://id.example.test/api/auth/registration/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationId }),
      }),
    );
    expect(evaluate.status).toBe(200);
    const decision = (await evaluate.json()) as { readonly decision: "allowed"; readonly intentId: string; readonly invitation: { readonly email: string }; readonly continueOAuth: boolean };
    expect(decision).toEqual(expect.objectContaining({
      decision: "allowed",
      invitation: expect.objectContaining({ email: "invitee@example.test" }),
      continueOAuth: false,
    }));

    const mismatch = await auth.handler(new Request("https://id.example.test/api/auth/registration/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intentId: decision.intentId, name: "Wrong", email: "wrong@example.test", password: "password12345" }),
    }));
    expect(mismatch.status).toBe(400);
    await expect(mismatch.json()).resolves.toMatchObject({ code: "registration_invitation_email_mismatch" });
    expect(userCount(raw, "wrong@example.test")).toBe(0);

    const submit = await auth.handler(new Request("https://id.example.test/api/auth/registration/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intentId: decision.intentId, name: "Invitee", email: "invitee@example.test", password: "password12345" }),
    }));
    expect(submit.status).toBe(200);
    const signup = await auth.handler(new Request("https://id.example.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-id-registration-intent": decision.intentId },
      body: JSON.stringify({ name: "Invitee", email: "invitee@example.test", password: "password12345" }),
    }));
    expect(signup.status).toBe(200);

    const invitation = raw.prepare(`select "status" from "invitation" where "id" = ?`).get(invitationId) as { readonly status: string };
    expect(invitation.status).toBe("accepted");
    const member = raw.prepare(`select "role" from "member" where "organizationId" = 'org_reg' and "userId" = (select "id" from "user" where "email" = 'invitee@example.test')`).get() as { readonly role: string };
    expect(member.role).toBe("member");
  });

  it("requires authority over the existing policy scope before moving it to another organization", async () => {
    const { auth, raw, emailSender } = await createHarness();
    const cookie = await signInAdmin(auth, emailSender);
    const clientId = await createOAuthClient(auth, cookie);
    const policyId = await createEnabledPolicy(auth, cookie, clientId);

    raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_other', 'Other Org', 'other-org', 1700000000000);`);
    await auth.api.createUser({
      body: {
        name: "Other Owner",
        email: "other-owner@example.test",
        password: "password12345",
        data: { emailVerified: true },
      },
    });
    const otherOwner = raw.prepare(`select "id" from "user" where "email" = ?`).get("other-owner@example.test") as { readonly id: string };
    raw.exec(`insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('m_other_owner', 'org_other', '${otherOwner.id}', 'owner', 1700000000000);`);
    const otherOwnerSignIn = await adminOtpSignIn(auth, emailSender, {
      email: "other-owner@example.test",
      password: "password12345",
    });
    const otherOwnerCookie = otherOwnerSignIn.headers.get("set-cookie") ?? "";

    const move = await auth.handler(
      new Request(`https://id.example.test/api/auth/admin/registration-policies/${policyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: otherOwnerCookie },
        body: JSON.stringify({ organizationId: "org_other" }),
      }),
    );

    expect(move.status).toBe(403);
    const policy = raw.prepare(`select "organizationId" from "registrationPolicy" where "id" = ?`).get(policyId) as { readonly organizationId: string };
    expect(policy.organizationId).toBe("org_reg");
  });
});
