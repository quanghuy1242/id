# 020 — A4: content-api SCIM + OAuth Client Pickup Migration

**Date**: 2026-05-27
**Status**: handoff document — implementation pending
**Prerequisites**: A1 ✓, A2 ✓, A3 ✓, A5 ✓ (all in `id` repo, complete)

## 1. Summary

Replace content-api's `IdContentPrincipalDirectory` (which calls `id`'s now-deleted principal-validation endpoints) with a SCIM-based adapter that also uses the OAuth client picker for service-account validation.

No new `id` endpoints needed. All target endpoints are production-ready.

## 2. Pre-flight: audience alignment (1-line `id` change)

### Problem

SCIM and OAuth picker endpoints use **different** JWT audiences:

| Endpoint | Default audience |
|---|---|
| SCIM (`scim/v2/*`) | `{idBaseUrl}/scim` |
| OAuth picker (`admin/oauth-clients/lookup`) | `{idBaseUrl}/system` |

A JWT can only carry one `aud` claim. One M2M token cannot satisfy both. Without alignment, content-api needs two `ClientCredentialsTokenProvider` instances — two audiences, two scopes, two cached tokens, double the complexity.

### Recommended fix

Change one line in `id`'s `get-auth.ts` (line 147) so SCIM accepts the same `/system` audience as the picker:

```diff
// workers/core/src/auth/get-auth.ts:145-148
  idScimDirectory({
    issuer,
-   audience: scimAudience,
+   audience: systemResourceServerAudience(env.BETTER_AUTH_URL),
  }),
```

**File**: `~/pjs/auth/workers/core/src/auth/get-auth.ts`

Import `systemResourceServerAudience` at the top (already done — check existing imports at line 6).

Then also remove the now-unused `scimDirectoryAudience` import and the `scimAudience` variable on line 67.

**Why this is safe**:
- Both are id's own internal resource-server APIs gated behind M2M bearer tokens
- There is no production M2M client depending on the `/scim` audience (SCIM was just shipped in A3, no consumers exist yet)
- The `/system` audience already means "id's internal resource server" — SCIM reads fit naturally
- Simpler operations: one M2M client, one audience, one token scope

The rest of this document assumes this change is applied. **See section 8 for the fallback approach** if the id change cannot be made.

## 3. Files to change (11)

All paths relative to `~/pjs/content-api`.

| # | File | Action |
|---|---|---|
| 1 | `src/infrastructure/identity/scim-content-principal-directory.ts` | **New** |
| 2 | `src/shared/constants.ts` | Add `SCIM_ORG_ADMINS_GROUP_ID` |
| 3 | `src/infrastructure/identity/client-credentials-token-provider.ts` | Edit cache key + error messages |
| 4 | `src/config/env.ts` | Replace `ID_PRINCIPAL_VALIDATION_*` with `ID_SCIM_*` |
| 5 | `src/composition/create-request-container.ts` | Wire new adapter |
| 6 | `tests/helpers.ts` | Replace mock endpoints |
| 7 | `tests/iam-roles.test.ts` | Rename counter |
| 8 | `wrangler.jsonc` | Update env vars |
| 9 | `wrangler.test.jsonc` | Update env vars |
| 10 | `.dev.vars.example` | Update env vars |
| 11 | `src/infrastructure/identity/id-content-principal-directory.ts` | Delete |

## 4. Detailed changes

### 4.1 New file: `src/infrastructure/identity/scim-content-principal-directory.ts`

```typescript
import type { ContentPrincipalDirectory } from "@/domain/iam/content-principal-directory";
import { ValidationError } from "@/shared/errors";
import { SCIM_ORG_ADMINS_GROUP_ID } from "@/shared/constants";

export type ScimContentPrincipalDirectoryConfig = {
  readonly idBaseUrl: string;
  readonly accessTokenProvider: {
    getAccessToken(): Promise<string>;
  };
  readonly fetchImpl?: typeof fetch;
};

const OAUTH_CLIENT_LOOKUP_PATH = "/api/auth/admin/oauth-clients/lookup";
const SCIM_V2 = "/api/auth/scim/v2";

export class ScimContentPrincipalDirectory implements ContentPrincipalDirectory {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ScimContentPrincipalDirectoryConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async validateUser(params: { userId: string }): Promise<void> {
    await this.get(`${SCIM_V2}/Users/${encodeURIComponent(params.userId)}`);
  }

  async validateUserInOrganization(params: { userId: string; orgId: string }): Promise<void> {
    await this.get(
      `${SCIM_V2}/tenants/${encodeURIComponent(params.orgId)}/Users/${encodeURIComponent(params.userId)}`,
    );
  }

  async validateTeamInOrganization(params: { teamId: string; orgId: string }): Promise<void> {
    await this.get(
      `${SCIM_V2}/tenants/${encodeURIComponent(params.orgId)}/Groups/${encodeURIComponent(params.teamId)}`,
    );
  }

  async validateServiceAccountForOrganization(params: {
    clientId: string;
    orgId: string;
    resource: string;
  }): Promise<void> {
    const url = new URL(OAUTH_CLIENT_LOOKUP_PATH, this.config.idBaseUrl);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("org_id", params.orgId);
    url.searchParams.set("resource", params.resource);
    await this.get(url.toString());
  }

  async validateOrganizationAdministrator(params: {
    userId: string;
    orgId: string;
  }): Promise<void> {
    const url = new URL(
      `${SCIM_V2}/tenants/${encodeURIComponent(params.orgId)}/Groups`,
      this.config.idBaseUrl,
    );
    url.searchParams.set(
      "filter",
      `id eq "${SCIM_ORG_ADMINS_GROUP_ID}" and members.value eq "${params.userId}"`,
    );
    const response = await this.getText(url.toString());
    const body = JSON.parse(response) as { totalResults?: number };
    if (!body.totalResults || body.totalResults === 0) {
      throw new ValidationError("Principal is not an organization administrator", { status: 404 });
    }
  }

  private async get(path: string): Promise<void> {
    const token = await this.config.accessTokenProvider.getAccessToken();
    const response = await this.fetchImpl(path, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/scim+json, application/json",
      },
    });
    if (!response.ok) {
      throw new ValidationError("SCIM principal directory lookup failed", {
        status: response.status,
      });
    }
  }

  private async getText(url: string): Promise<string> {
    const token = await this.config.accessTokenProvider.getAccessToken();
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/scim+json, application/json",
      },
    });
    if (!response.ok) {
      throw new ValidationError("SCIM principal directory lookup failed", {
        status: response.status,
      });
    }
    return response.text();
  }
}
```

### 4.2 `src/shared/constants.ts` — add constant

```typescript
export const SCIM_ORG_ADMINS_GROUP_ID = "org-admins" as const;
```

### 4.3 `src/infrastructure/identity/client-credentials-token-provider.ts`

Three changes:

**Cache key** (line 114):
```diff
- "principal-validation-token",
+ "scim-directory-token",
```

**Error message** (line 93):
```diff
- throw new UnauthorizedError("Principal validation M2M token request failed");
+ throw new UnauthorizedError("SCIM directory M2M token request failed");
```

**Error message** (line 98):
```diff
- throw new UnauthorizedError("Principal validation M2M token response was invalid");
+ throw new UnauthorizedError("SCIM directory M2M token response was invalid");
```

### 4.4 `src/config/env.ts`

Replace 6 principal-validation env vars with 6 SCIM ones:

**Schema** (lines 9-14):
```diff
- ID_PRINCIPAL_VALIDATION_URL: z.url(),
- ID_PRINCIPAL_VALIDATION_TOKEN_URL: z.url().optional(),
- ID_PRINCIPAL_VALIDATION_CLIENT_ID: z.string().min(1),
- ID_PRINCIPAL_VALIDATION_CLIENT_SECRET: z.string().min(1),
- ID_PRINCIPAL_VALIDATION_AUDIENCE: z.string().min(1),
- ID_PRINCIPAL_VALIDATION_SCOPE: z.string().min(1),
+ ID_SCIM_URL: z.url(),
+ ID_SCIM_TOKEN_URL: z.url().optional(),
+ ID_SCIM_CLIENT_ID: z.string().min(1),
+ ID_SCIM_CLIENT_SECRET: z.string().min(1),
+ ID_SCIM_AUDIENCE: z.string().min(1),
+ ID_SCIM_SCOPE: z.string().min(1),
```

**AppBindings type** (lines 31-37):
```diff
- ID_PRINCIPAL_VALIDATION_URL: string;
- ID_PRINCIPAL_VALIDATION_TOKEN_URL?: string;
- ID_PRINCIPAL_VALIDATION_CLIENT_ID: string;
- ID_PRINCIPAL_VALIDATION_CLIENT_SECRET: string;
- ID_PRINCIPAL_VALIDATION_AUDIENCE: string;
- ID_PRINCIPAL_VALIDATION_SCOPE: string;
- ID_PRINCIPAL_VALIDATION_TOKEN_CACHE?: KVNamespace;
+ ID_SCIM_URL: string;
+ ID_SCIM_TOKEN_URL?: string;
+ ID_SCIM_CLIENT_ID: string;
+ ID_SCIM_CLIENT_SECRET: string;
+ ID_SCIM_AUDIENCE: string;
+ ID_SCIM_SCOPE: string;
+ ID_SCIM_TOKEN_CACHE?: KVNamespace;
```

### 4.5 `src/composition/create-request-container.ts`

**Import** (line 55):
```diff
- import { IdContentPrincipalDirectory } from "@/infrastructure/identity/id-content-principal-directory";
+ import { ScimContentPrincipalDirectory } from "@/infrastructure/identity/scim-content-principal-directory";
```

**Wiring** (lines 104-117):
```diff
- const principalValidationTokenProvider = new ClientCredentialsTokenProvider({
-   tokenUrl: config.ID_PRINCIPAL_VALIDATION_TOKEN_URL ?? new URL("/api/auth/oauth2/token", config.ID_PRINCIPAL_VALIDATION_URL).toString(),
-   clientId: config.ID_PRINCIPAL_VALIDATION_CLIENT_ID,
-   clientSecret: config.ID_PRINCIPAL_VALIDATION_CLIENT_SECRET,
-   audience: config.ID_PRINCIPAL_VALIDATION_AUDIENCE,
-   scope: config.ID_PRINCIPAL_VALIDATION_SCOPE,
-   cache: env.ID_PRINCIPAL_VALIDATION_TOKEN_CACHE,
-   fetchImpl: options?.fetchImpl,
- });
- const principalDirectory = new IdContentPrincipalDirectory({
-   baseUrl: config.ID_PRINCIPAL_VALIDATION_URL,
-   accessTokenProvider: principalValidationTokenProvider,
-   fetchImpl: options?.fetchImpl,
- });
+ const scimTokenProvider = new ClientCredentialsTokenProvider({
+   tokenUrl: config.ID_SCIM_TOKEN_URL ?? new URL("/api/auth/oauth2/token", config.ID_SCIM_URL).toString(),
+   clientId: config.ID_SCIM_CLIENT_ID,
+   clientSecret: config.ID_SCIM_CLIENT_SECRET,
+   audience: config.ID_SCIM_AUDIENCE,
+   scope: config.ID_SCIM_SCOPE,
+   cache: env.ID_SCIM_TOKEN_CACHE,
+   fetchImpl: options?.fetchImpl,
+ });
+ const principalDirectory = new ScimContentPrincipalDirectory({
+   idBaseUrl: config.ID_SCIM_URL,
+   accessTokenProvider: scimTokenProvider,
+   fetchImpl: options?.fetchImpl,
+ });
```

### 4.6 `tests/helpers.ts`

**Constants** (lines 20-26):
```diff
- const ID_PRINCIPAL_VALIDATION_URL = "https://id.test";
- const ID_PRINCIPAL_VALIDATION_TOKEN_URL = "https://id.test/api/auth/oauth2/token";
- const ID_PRINCIPAL_VALIDATION_CLIENT_ID = "content-api-principal-validation";
- const ID_PRINCIPAL_VALIDATION_CLIENT_SECRET = "principal-validation-secret";
- const ID_PRINCIPAL_VALIDATION_AUDIENCE = "https://id.test/principal-validation";
- const ID_PRINCIPAL_VALIDATION_SCOPE = "identity:principals:validate";
- const ID_PRINCIPAL_VALIDATION_ACCESS_TOKEN = "principal-validation-access-token";
+ const ID_SCIM_URL = "https://id.test";
+ const ID_SCIM_TOKEN_URL = "https://id.test/api/auth/oauth2/token";
+ const ID_SCIM_CLIENT_ID = "content-api-scim-directory";
+ const ID_SCIM_CLIENT_SECRET = "scim-directory-secret";
+ const ID_SCIM_AUDIENCE = "https://id.test/system";
+ const ID_SCIM_SCOPE = "identity:directory:read oauth:clients:read";
+ const ID_SCIM_ACCESS_TOKEN = "scim-directory-access-token";
```

**Counter** (line 31):
```diff
- export let principalValidationTokenRequests = 0;
+ export let scimTokenRequests = 0;
```

**Mock fetchImpl** (lines 33-79) — full replacement:

```typescript
export const app = createApp({
  fetchImpl: async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === AUTH_JWKS_URL) {
      return Response.json({ keys: [publicJwk] });
    }
    if (url === ID_SCIM_TOKEN_URL) {
      scimTokenRequests += 1;
      const bodyText = typeof init?.body === "string"
        ? init.body
        : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : "";
      const form = new URLSearchParams(bodyText);
      if (
        form.get("grant_type") !== "client_credentials" ||
        form.get("client_id") !== ID_SCIM_CLIENT_ID ||
        form.get("client_secret") !== ID_SCIM_CLIENT_SECRET ||
        form.get("resource") !== ID_SCIM_AUDIENCE ||
        form.get("scope") !== ID_SCIM_SCOPE
      ) {
        return Response.json({ error: "invalid_client" }, { status: 401 });
      }
      return Response.json({
        access_token: ID_SCIM_ACCESS_TOKEN,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    // Mock SCIM + OAuth picker endpoints
    if (
      url.startsWith(`${ID_SCIM_URL}/api/auth/scim/v2/`) ||
      url.startsWith(`${ID_SCIM_URL}/api/auth/admin/oauth-clients/`)
    ) {
      if (init?.headers && new Headers(init.headers).get("authorization") !== `Bearer ${ID_SCIM_ACCESS_TOKEN}`) {
        return Response.json({}, { status: 401 });
      }
      const parsedUrl = typeof url === "string" ? new URL(url) : new URL(url);
      const pathname = parsedUrl.pathname;
      const searchParams = parsedUrl.searchParams;
      const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";

      // OAuth client picker lookup
      if (pathname === "/api/auth/admin/oauth-clients/lookup") {
        const clientId = searchParams.get("client_id");
        const orgId = searchParams.get("org_id");
        if (!clientId || !orgId) {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }
        if (clientId.startsWith("missing-") || clientId === "wrong-org" || orgId === "wrong-org") {
          return Response.json({}, { status: 404 });
        }
        return Response.json({ id: clientId, name: clientId, referenceId: orgId });
      }

      // SCIM group filter for org-admins membership check
      if (pathname.includes("/Groups") && searchParams.has("filter")) {
        const filter = searchParams.get("filter") ?? "";
        if (filter.includes("org-admins")) {
          const userIdMatch = filter.match(/members\.value eq "([^"]+)"/);
          const userId = userIdMatch ? userIdMatch[1] : null;
          if (!userId || userId.startsWith("missing-") || userId === "wrong-org") {
            return Response.json({
              schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
              totalResults: 0,
              Resources: [],
            });
          }
          return Response.json({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
            totalResults: 1,
            Resources: [{
              id: "org-admins",
              displayName: "Organization Administrators",
              members: [{ value: userId, display: userId }],
            }],
          });
        }
      }

      // Sentinel values for "not found"
      if (lastSegment.startsWith("missing-") || lastSegment === "wrong-org") {
        return Response.json({}, { status: 404 });
      }

      // SCIM user endpoints (global and tenant-scoped)
      if (pathname.includes("/Users")) {
        return Response.json({ id: lastSegment, userName: lastSegment, active: true });
      }

      // SCIM group direct lookup
      if (pathname.includes("/Groups")) {
        return Response.json({ id: lastSegment, displayName: lastSegment });
      }

      return Response.json({}, { status: 404 });
    }
    return fetch(input);
  },
});
```

**request() function** (lines 264-269):
```diff
      AUTH_REQUIRED_SCOPE: "content:read content:write content:share",
-     ID_PRINCIPAL_VALIDATION_URL,
-     ID_PRINCIPAL_VALIDATION_TOKEN_URL,
-     ID_PRINCIPAL_VALIDATION_CLIENT_ID,
-     ID_PRINCIPAL_VALIDATION_CLIENT_SECRET,
-     ID_PRINCIPAL_VALIDATION_AUDIENCE,
-     ID_PRINCIPAL_VALIDATION_SCOPE,
+     ID_SCIM_URL,
+     ID_SCIM_TOKEN_URL,
+     ID_SCIM_CLIENT_ID,
+     ID_SCIM_CLIENT_SECRET,
+     ID_SCIM_AUDIENCE,
+     ID_SCIM_SCOPE,
```

**setupBeforeEach** (line 355):
```diff
- principalValidationTokenRequests = 0;
+ scimTokenRequests = 0;
```

### 4.7 `tests/iam-roles.test.ts`

**Import** (line 8):
```diff
- import { bootstrapContentIamAdmin, principalValidationTokenRequests, request, seedBootstrapAdmin, setupBeforeAll, setupBeforeEach } from "./helpers";
+ import { bootstrapContentIamAdmin, request, scimTokenRequests, seedBootstrapAdmin, setupBeforeAll, setupBeforeEach } from "./helpers";
```

**Assertion** (line 215):
```diff
- expect(principalValidationTokenRequests).toBe(1);
+ expect(scimTokenRequests).toBe(1);
```

### 4.8 `wrangler.jsonc`

Lines 33-35:
```diff
-   "ID_PRINCIPAL_VALIDATION_URL": "https://id.quanghuy.dev",
-   "ID_PRINCIPAL_VALIDATION_AUDIENCE": "https://id.quanghuy.dev/principal-validation",
-   "ID_PRINCIPAL_VALIDATION_SCOPE": "identity:principals:validate",
+   "ID_SCIM_URL": "https://id.quanghuy.dev",
+   "ID_SCIM_AUDIENCE": "https://id.quanghuy.dev/system",
+   "ID_SCIM_SCOPE": "identity:directory:read oauth:clients:read",
```

### 4.9 `wrangler.test.jsonc`

Lines 25-29:
```diff
-   "ID_PRINCIPAL_VALIDATION_URL": "https://id.test",
-   "ID_PRINCIPAL_VALIDATION_CLIENT_ID": "content-api-principal-validation",
-   "ID_PRINCIPAL_VALIDATION_CLIENT_SECRET": "principal-validation-secret",
-   "ID_PRINCIPAL_VALIDATION_AUDIENCE": "https://id.test/principal-validation",
-   "ID_PRINCIPAL_VALIDATION_SCOPE": "identity:principals:validate",
+   "ID_SCIM_URL": "https://id.test",
+   "ID_SCIM_CLIENT_ID": "content-api-scim-directory",
+   "ID_SCIM_CLIENT_SECRET": "scim-directory-secret",
+   "ID_SCIM_AUDIENCE": "https://id.test/system",
+   "ID_SCIM_SCOPE": "identity:directory:read oauth:clients:read",
```

### 4.10 `.dev.vars.example`

Lines 4-5:
```diff
- ID_PRINCIPAL_VALIDATION_CLIENT_ID=
- ID_PRINCIPAL_VALIDATION_CLIENT_SECRET=
+ ID_SCIM_CLIENT_ID=
+ ID_SCIM_CLIENT_SECRET=
```

### 4.11 Delete

```bash
rm src/infrastructure/identity/id-content-principal-directory.ts
```

## 5. Endpoint mapping (reference)

| Old principal-validation call | New SCIM/OAuth call |
|---|---|
| `POST ...principal-validation/users/validate` | `GET /api/auth/scim/v2/Users/:id` |
| `POST ...principal-validation/users/validate-organization-member` | `GET /api/auth/scim/v2/tenants/:orgId/Users/:id` |
| `POST ...principal-validation/teams/validate-organization-team` | `GET /api/auth/scim/v2/tenants/:orgId/Groups/:id` |
| `POST ...principal-validation/service-accounts/validate-organization-grant` | `GET /api/auth/admin/oauth-clients/lookup?client_id=&org_id=&resource=` |
| `POST ...principal-validation/organization-administrators/validate` | `GET /api/auth/scim/v2/tenants/:orgId/Groups?filter=id eq "org-admins" and members.value eq ":id"` |

All new calls use GET with the same M2M bearer token (single client_credentials grant). Token scope: `identity:directory:read oauth:clients:read` (space-separated). Token audience: `{idBaseUrl}/system`.

## 6. Required M2M client setup

Register a new M2M client in `id`:

| Setting | Value |
|---|---|
| Client ID | `content-api-scim-directory` |
| Grant type | `client_credentials` |
| Audience (resource) | `https://id.quanghuy.dev/system` |
| Scopes | `identity:directory:read oauth:clients:read` |
| Organization | infra org |
| Secret | stored as `ID_SCIM_CLIENT_SECRET` in content-api env |

Delete the old `content-api-principal-validation` M2M client after migration.

## 7. What is NOT changed

| Component | Notes |
|---|---|
| `ContentPrincipalDirectory` interface | Unchanged — adapter swap only |
| 6 use cases calling `principalDirectory.*` | Unchanged |
| `AuthenticateBearerTokenUseCase` | Still validates JWT locally via `jose` + JWKS |
| Local `users` table | Admin role still from local DB projection |
| Content IAM policy engine | `ContentPrincipalDirectory` is only for durable IAM mutations |
| Team claims in JWT | Still from `team_ids` claim |
| `ClientCredentialsTokenProvider` class | Reused as-is; only cache key + error messages change |
| `wrangler.jsonc` KV binding | `ID_PRINCIPAL_VALIDATION_TOKEN_CACHE` → `ID_SCIM_TOKEN_CACHE` (rename only) |

## 8. Fallback: two token providers (if `id` audience change is rejected)

If the SCIM plugin must keep its own `/scim` audience, content-api needs two `ClientCredentialsTokenProvider` instances:

```typescript
// create-request-container.ts

const scimTokenProvider = new ClientCredentialsTokenProvider({
  tokenUrl: config.ID_SCIM_TOKEN_URL ?? new URL("/api/auth/oauth2/token", config.ID_SCIM_URL).toString(),
  clientId: config.ID_SCIM_CLIENT_ID,
  clientSecret: config.ID_SCIM_CLIENT_SECRET,
  audience: config.ID_SCIM_AUDIENCE,        // e.g. {url}/scim
  scope: config.ID_SCIM_SCOPE,              // e.g. identity:directory:read
  cache: env.ID_SCIM_TOKEN_CACHE,
  fetchImpl: options?.fetchImpl,
});

const systemTokenProvider = new ClientCredentialsTokenProvider({
  tokenUrl: config.ID_SCIM_TOKEN_URL ?? new URL("/api/auth/oauth2/token", config.ID_SCIM_URL).toString(),
  clientId: config.ID_SCIM_CLIENT_ID,
  clientSecret: config.ID_SCIM_CLIENT_SECRET,
  audience: config.ID_SCIM_SYSTEM_AUDIENCE, // e.g. {url}/system
  scope: config.ID_SCIM_SYSTEM_SCOPE,       // e.g. oauth:clients:read
  cache: env.ID_SCIM_TOKEN_CACHE,
  fetchImpl: options?.fetchImpl,
});

const principalDirectory = new ScimContentPrincipalDirectory({
  idBaseUrl: config.ID_SCIM_URL,
  scimTokenProvider,
  systemTokenProvider,
  fetchImpl: options?.fetchImpl,
});
```

This requires:
- 2 additional env vars: `ID_SCIM_SYSTEM_AUDIENCE`, `ID_SCIM_SYSTEM_SCOPE`
- `ScimContentPrincipalDirectory` constructor takes `scimTokenProvider` + `systemTokenProvider` instead of one `accessTokenProvider`
- Tests need two mock tokens and two counters

The audience alignment approach (section 2) is strongly preferred.

## 9. Verification

After implementation, run in content-api:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all tests pass, clean lint, clean typecheck. The `scimTokenRequests` counter should show 1 (M2M token cached after first use).

## 10. id docs to update after implementation

In the `id` repo (`~/pjs/auth`):

1. `docs/013_identity-event-standards-and-decisions.md` — mark A4 ✓, add commit hash + date
2. `docs/018_m2m-oauth-client-org-binding.md` — note content-api migrated to SCIM + OAuth picker
3. `docs/017_scim-directory-and-m2m-principal-contract.md` — note SCIM audience change (if applied)

Track A is then **fully complete** (A1–A5 all ✓).
