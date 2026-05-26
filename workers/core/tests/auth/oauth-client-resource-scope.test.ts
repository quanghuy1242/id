import { describe, expect, it } from "vitest";
import {
  attachClientResourceScope,
  bootstrapAdmin,
  createM2MClient,
  createOAuthScope,
  createResourceServer,
  createTestEnv,
} from "./m2m-helpers";

async function withOrg(test: Awaited<ReturnType<typeof createTestEnv>>, id: string, slug: string): Promise<void> {
  test.raw.exec(
    `insert into "organization" ("id", "name", "slug", "createdAt") values ('${id}', '${id}', '${slug}', 1700000000000);`,
  );
}

describe("oauthClientResourceScope CRUD + invariants", () => {
  it("enforces same-organization binding between client.referenceId and resourceServer.organizationId", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_a", "org-a");
    await withOrg(test, "org_b", "org-b");

    const resourceServerA = await createResourceServer(test, cookie, {
      organizationId: "org_a",
      slug: "content-a",
      name: "Content A",
      audience: "https://content-a.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId: resourceServerA, scope: "content:read" });

    const clientB = await createM2MClient(test, cookie, { name: "B client", scope: "content:read", referenceId: "org_b" });
    const attach = await attachClientResourceScope(test, cookie, {
      clientId: clientB.clientId,
      resourceServerId: resourceServerA,
      allowedScopes: ["content:read"],
    });
    expect(attach.status).toBe(400);
  });

  it("rejects an allowed-scope subset that exceeds the resource server's declared scopes", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId, scope: "content:read" });

    const client = await createM2MClient(test, cookie, { name: "C", scope: "content:read", referenceId: "org_default" });
    const attach = await attachClientResourceScope(test, cookie, {
      clientId: client.clientId,
      resourceServerId,
      allowedScopes: ["content:read", "content:write-not-declared"],
    });
    expect([400, 403]).toContain(attach.status);
  });

  it("rejects duplicate (clientId, resourceServerId) on second create (unique constraint)", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId, scope: "content:read" });

    const client = await createM2MClient(test, cookie, { name: "C", scope: "content:read", referenceId: "org_default" });
    const first = await attachClientResourceScope(test, cookie, {
      clientId: client.clientId,
      resourceServerId,
      allowedScopes: ["content:read"],
    });
    expect(first.status).toBe(200);
    const dup = await attachClientResourceScope(test, cookie, {
      clientId: client.clientId,
      resourceServerId,
      allowedScopes: ["content:read"],
    });
    expect(dup.status).toBe(400);
  });

  it("rejects attaching scope to a client whose referenceId is null (only org-owned clients can use this endpoint)", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId, scope: "content:read" });
    const infra = await createM2MClient(test, cookie, { name: "Infra", scope: "content:read", referenceId: null });

    const attach = await attachClientResourceScope(test, cookie, {
      clientId: infra.clientId,
      resourceServerId,
      allowedScopes: ["content:read"],
    });
    expect(attach.status).toBe(403);
  });
});
