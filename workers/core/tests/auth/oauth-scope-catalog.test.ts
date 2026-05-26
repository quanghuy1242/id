import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it } from "vitest";
import { authPluginConfig } from "../../src/auth/config";
import {
  assertDirectShareScopes,
  assertRequestedResourceScopesAllowed,
  invalidateOAuthResourceScopes,
  loadOAuthResourceScopes,
  loadOAuthScopesFromCache,
} from "../../src/auth/plugins/oauth-scope-catalog/scopes";
import {
  invalidateClientResourceScopes,
  loadClientResourceScopes,
} from "../../src/auth/plugins/oauth-scope-catalog/grants";
import {
  oauthClientResourceScopeBetterAuthFields,
  oauthResourceScopeBetterAuthFields,
} from "../../src/auth/plugins/oauth-scope-catalog/schema";
import {
  assertTeamIdsWithinTokenLimit,
  loadUserTeamIdsForOrganization,
} from "../../src/auth/plugins/oauth-scope-catalog/authorization-context";

type StoredValue = {
  readonly value: string;
  readonly ttl?: number;
};

function createKv() {
  const values = new Map<string, StoredValue>();
  const kv = {
    get: async (key: string) => values.get(key)?.value ?? null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      values.set(key, { value, ttl: options?.expirationTtl });
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  } as unknown as KVNamespace;

  return { kv, values };
}

describe("OAuth scope catalog schema", () => {
  it("derives Better Auth fields from canonical Zod schemas", () => {
    expect(oauthResourceScopeBetterAuthFields.resourceServerId).toEqual(
      expect.objectContaining({ type: "string", required: true, references: { model: "resourceServer", field: "id" } }),
    );
    expect(oauthResourceScopeBetterAuthFields.enabled).toEqual(
      expect.objectContaining({ type: "boolean", required: true, defaultValue: true }),
    );
    expect(oauthClientResourceScopeBetterAuthFields.allowedScopes).toEqual(
      expect.objectContaining({ type: "string[]", required: true }),
    );
    expect(oauthClientResourceScopeBetterAuthFields.clientId).toEqual(
      expect.objectContaining({ type: "string", required: true, index: true }),
    );
  });
});

describe("OAuth scope catalog cache", () => {
  beforeEach(async () => {
    await invalidateOAuthResourceScopes({ KV: createKv().kv });
  });

  it("loads enabled scopes from KV without hitting the store", async () => {
    const { kv, values } = createKv();
    values.set(authPluginConfig.oauthScopeCacheKey, {
      value: JSON.stringify([{ resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:read", system: false }]),
    });

    const result = await loadOAuthScopesFromCache(kv, async () => {
      throw new Error("store should not be read on cache hit");
    });

    expect(result).toEqual({
      rows: [{ resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:read", system: false }],
      scopes: ["content:read"],
      source: "cache",
    });
  });

  it("loads rows from the plugin-owned D1 query on KV miss and marks id-owned audiences as system", async () => {
    const { kv } = createKv();
    const db = {
      prepare: (sql: string) => {
        expect(sql).toContain('from "oauthResourceScope"');
        expect(sql).toContain('join "resourceServer"');
        expect(sql).toContain('"organizationId"');
        return {
          bind: (...values: number[]) => {
            expect(values).toEqual([1, 1]);
            return {
              all: async () => ({
                results: [
                  { resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:write", organizationId: "org_1" },
                  { resourceServerId: "rs_system", audience: "https://id.example.test/system", scope: "oauth:clients:read", organizationId: null },
                ],
              }),
            };
          },
        };
      },
    } as unknown as D1Database;

    await expect(loadOAuthResourceScopes({ DB: db, KV: kv })).resolves.toEqual({
      rows: [
        { resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:write", system: false },
        { resourceServerId: "rs_system", audience: "https://id.example.test/system", scope: "oauth:clients:read", system: true },
      ],
      scopes: ["content:write", "oauth:clients:read"],
      source: "store",
    });
  });

  it("invalidates scope cache after mutations", async () => {
    const { kv, values } = createKv();
    values.set(authPluginConfig.oauthScopeCacheKey, { value: "[]" });

    await invalidateOAuthResourceScopes({ KV: kv });

    expect(values.has(authPluginConfig.oauthScopeCacheKey)).toBe(false);
  });
});

describe("OAuth client resource-scope cache", () => {
  it("keeps warm-isolate resource-scope rows keyed by client ID", async () => {
    const { kv } = createKv();
    await invalidateClientResourceScopes({ KV: kv }, "client_a");
    await invalidateClientResourceScopes({ KV: kv }, "client_b");
    const reads: string[] = [];
    const db = {
      prepare: () => ({
        bind: (clientId: string) => ({
          all: async () => {
            reads.push(clientId);
            return {
              results: [{
                id: `rs_scope_${clientId}`,
                clientId,
                resourceServerId: "rs_1",
                audience: "https://api.example.test",
                allowedScopes: JSON.stringify(["content:write"]),
                enabled: 1,
              }],
            };
          },
        }),
      }),
    } as unknown as D1Database;

    await expect(loadClientResourceScopes({ DB: db, KV: kv }, "client_a")).resolves.toEqual([
      expect.objectContaining({ clientId: "client_a" }),
    ]);
    await expect(loadClientResourceScopes({ DB: db, KV: kv }, "client_b")).resolves.toEqual([
      expect.objectContaining({ clientId: "client_b" }),
    ]);
    await expect(loadClientResourceScopes({ DB: db, KV: kv }, "client_a")).resolves.toEqual([
      expect.objectContaining({ clientId: "client_a" }),
    ]);
    expect(reads).toEqual(["client_a", "client_b"]);
  });

  it("refills resource-scope KV cache in the background when waitUntil is available", async () => {
    const pendingWrite = new Promise<void>(() => undefined);
    const waited: Promise<unknown>[] = [];
    const kv = {
      get: async () => null,
      put: () => pendingWrite,
      delete: async () => undefined,
    } as unknown as KVNamespace;
    const db = {
      prepare: () => ({
        bind: (clientId: string) => ({
          all: async () => ({
            results: [{
              id: `rs_scope_${clientId}`,
              clientId,
              resourceServerId: "rs_1",
              audience: "https://api.example.test",
              allowedScopes: JSON.stringify(["content:write"]),
              enabled: 1,
            }],
          }),
        }),
      }),
    } as unknown as D1Database;

    const result = await loadClientResourceScopes(
      { DB: db, KV: kv },
      "client_background",
      { waitUntil: (task) => waited.push(task) },
    );

    expect(result).toEqual([expect.objectContaining({ clientId: "client_background" })]);
    expect(waited).toHaveLength(1);
  });
});

describe("OAuth scope issuance assertions", () => {
  const catalog = {
    scopeRows: [
      { resourceServerId: "rs_content", audience: "https://content.example.test", scope: "content:read", system: false },
      { resourceServerId: "rs_content", audience: "https://content.example.test", scope: "content:share", system: false },
      { resourceServerId: "rs_other", audience: "https://other.example.test", scope: "content:read", system: false },
    ],
  };

  it("accepts product scopes only for their owning resource audience", () => {
    expect(() =>
      assertRequestedResourceScopesAllowed({
        catalog,
        resource: "https://content.example.test",
        scopes: ["openid", "content:read"],
      })).not.toThrow();
  });

  it("rejects unknown, disabled, or wrong-audience scopes before token issuance", () => {
    expect(() =>
      assertRequestedResourceScopesAllowed({
        catalog,
        resource: "https://other.example.test",
        scopes: ["content:share"],
      })).toThrow(APIError);
  });

  it("rejects direct-share requests for workspace-only scopes", () => {
    expect(() => assertDirectShareScopes(["content:read"])).not.toThrow();
    expect(() => assertDirectShareScopes(["content:share"])).toThrow(APIError);
  });

  it("fails closed instead of truncating oversized team claims", () => {
    const teamIds = Array.from({ length: authPluginConfig.maxTokenTeamIds + 1 }, (_, index) => `team_${index}`);

    expect(() => assertTeamIdsWithinTokenLimit(teamIds)).toThrow(APIError);
  });

  it("resolves token team IDs only inside the selected organization", async () => {
    const { kv } = createKv();
    const db = {
      prepare: (sql: string) => {
        expect(sql).toContain('join "team"');
        return {
          bind: (...values: string[]) => {
            expect(values).toEqual(["user_1", "org_1"]);
            return {
              all: async () => ({
                results: [{ teamId: "team_editorial" }, { teamId: "team_editorial" }],
              }),
            };
          },
        };
      },
    } as unknown as D1Database;

    await expect(loadUserTeamIdsForOrganization({ DB: db, KV: kv }, "user_1", "org_1")).resolves.toEqual([
      "team_editorial",
    ]);
  });
});
