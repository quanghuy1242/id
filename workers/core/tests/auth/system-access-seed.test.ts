import { describe, expect, it } from "vitest";
import {
  authPluginConfig,
  systemResourceServerAudience,
} from "../../src/auth/config";
import { getAuth } from "../../src/auth/get-auth";
import { ensureSystemAccessCatalog } from "../../src/auth/system-access-seed";
import {
  OAUTH_RESOURCE_SCOPE_MODEL,
  RESOURCE_SERVER_MODEL,
} from "../../src/shared/constants";
import type { AdapterContext } from "../../src/auth/plugins/oauth-scope-catalog/types";
import type { OAuthResourceScopeRow } from "../../src/auth/plugins/oauth-scope-catalog/schema";
import type { ResourceServerRow } from "../../src/auth/plugins/resource-server/schema";
import { createTestEnv } from "./m2m-helpers";

describe("system access seed", () => {
  it("idempotently creates the system resource server and default system scopes", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const context = await auth.$context;
    const adapter = context.adapter as AdapterContext;

    await test.env.KV.put(authPluginConfig.resourceAudienceCacheKey, "[]");
    await test.env.KV.put(authPluginConfig.oauthScopeCacheKey, "[]");

    const first = await ensureSystemAccessCatalog(
      test.env,
      adapter,
      "seed_user",
    );

    expect(first.changed).toBe(true);
    await expect(
      test.env.KV.get(authPluginConfig.resourceAudienceCacheKey),
    ).resolves.toBeNull();
    await expect(
      test.env.KV.get(authPluginConfig.oauthScopeCacheKey),
    ).resolves.toBeNull();

    const resourceServer = await adapter.findOne<ResourceServerRow>({
      model: RESOURCE_SERVER_MODEL,
      where: [{ field: "id", value: first.resourceServerId }],
    });
    expect(resourceServer).toEqual(
      expect.objectContaining({
        organizationId: null,
        slug: authPluginConfig.systemResourceServerSlug,
        name: authPluginConfig.systemResourceServerName,
        audience: systemResourceServerAudience(test.env.BETTER_AUTH_URL),
        enabled: true,
        createdBy: "seed_user",
      }),
    );

    const scopes = await adapter.findMany<OAuthResourceScopeRow>({
      model: OAUTH_RESOURCE_SCOPE_MODEL,
      where: [{ field: "resourceServerId", value: first.resourceServerId }],
    });
    expect(scopes.map((scope) => scope.scope).sort()).toEqual(
      [
        authPluginConfig.scimDirectoryScope,
        authPluginConfig.systemOAuthClientPickerScope,
      ].sort(),
    );
    expect(scopes.every((scope) => scope.enabled)).toBe(true);

    const second = await ensureSystemAccessCatalog(
      test.env,
      adapter,
      "seed_user",
    );
    expect(second).toEqual({
      resourceServerId: first.resourceServerId,
      scopeIds: first.scopeIds,
      changed: false,
    });
  });

  it("runs alongside first-admin bootstrap", async () => {
    const test = await createTestEnv();

    const response = await test.app.request(
      "/api/bootstrap/admin",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-bootstrap-token-v1",
        },
        body: JSON.stringify({
          email: "root@example.test",
          password: "password12345",
          name: "Root Admin",
          organization: { name: "Default", slug: "default" },
        }),
      },
      test.env,
    );

    expect(response.status).toBe(200);
    const resourceServer = test.raw
      .prepare(`select * from "resourceServer" where "audience" = ?`)
      .get(systemResourceServerAudience(test.env.BETTER_AUTH_URL)) as
      | ResourceServerRow
      | undefined;
    expect(resourceServer).toEqual(
      expect.objectContaining({
        organizationId: null,
        slug: authPluginConfig.systemResourceServerSlug,
        enabled: 1,
      }),
    );

    const scopes = test.raw
      .prepare(
        `select "scope" from "oauthResourceScope" where "resourceServerId" = ? order by "scope" asc`,
      )
      .all(resourceServer?.id) as Array<{ readonly scope: string }>;
    expect(scopes).toEqual(
      [
        { scope: authPluginConfig.scimDirectoryScope },
        { scope: authPluginConfig.systemOAuthClientPickerScope },
      ].sort((left, right) => left.scope.localeCompare(right.scope)),
    );
  });
});
