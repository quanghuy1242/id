import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import {
  assertResourceServerAccess,
  buildCreatePayload,
  buildDisablePayload,
  buildEnablePayload,
  buildUpdatePayload,
  type AuthorizeFn,
} from "../../src/auth/plugins/resource-server/operations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dummyAdapter = {} as unknown;

function permit(): AuthorizeFn {
  return async () => true;
}

function forbid(): AuthorizeFn {
  return async () => false;
}

// ---------------------------------------------------------------------------
// assertResourceServerAccess
// ---------------------------------------------------------------------------

describe("assertResourceServerAccess", () => {
  it("resolves when the authorize callback returns true", async () => {
    await expect(
      assertResourceServerAccess(
        permit(),
        "org_1",
        "user_1",
        "admin",
        dummyAdapter,
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves when the authorize callback returns true (org owner)", async () => {
    await expect(
      assertResourceServerAccess(
        permit(),
        "org_1",
        "user_1",
        "member",
        dummyAdapter,
      ),
    ).resolves.toBeUndefined();
  });

  it("throws FORBIDDEN when the authorize callback returns false", async () => {
    await expect(
      assertResourceServerAccess(
        forbid(),
        "org_1",
        "user_1",
        "member",
        dummyAdapter,
      ),
    ).rejects.toBeInstanceOf(APIError);
  });

  it("throws FORBIDDEN for unauthenticated (null role) when callback returns false", async () => {
    await expect(
      assertResourceServerAccess(
        forbid(),
        "org_1",
        "user_1",
        null,
        dummyAdapter,
      ),
    ).rejects.toBeInstanceOf(APIError);
  });

  it("throws FORBIDDEN when no authorize callback is provided", async () => {
    await expect(
      assertResourceServerAccess(
        undefined,
        "org_1",
        "user_1",
        "admin",
        dummyAdapter,
      ),
    ).rejects.toBeInstanceOf(APIError);
  });
});

// ---------------------------------------------------------------------------
// buildCreatePayload
// ---------------------------------------------------------------------------

describe("buildCreatePayload", () => {
  const base = {
    organizationId: "org_1",
    slug: "api",
    name: "API",
    audience: "https://api.example.test",
  };

  it("sets enabled to true", () => {
    const payload = buildCreatePayload(base, "user_1");
    expect(payload.enabled).toBe(true);
  });

  it("sets createdBy to actorId", () => {
    const payload = buildCreatePayload(base, "user_1");
    expect(payload.createdBy).toBe("user_1");
    expect(payload.updatedBy).toBe("user_1");
  });

  it("stamps createdAt and updatedAt close to now", () => {
    const before = Date.now();
    const payload = buildCreatePayload(base, "user_1");
    const after = Date.now();
    expect(payload.createdAt).toBeGreaterThanOrEqual(before);
    expect(payload.createdAt).toBeLessThanOrEqual(after);
    expect(payload.updatedAt).toBeGreaterThanOrEqual(before);
    expect(payload.updatedAt).toBeLessThanOrEqual(after);
  });

  it("passes through optional description", () => {
    const payload = buildCreatePayload(
      { ...base, description: "The main API" },
      "user_1",
    );
    expect(payload.description).toBe("The main API");
  });
});

// ---------------------------------------------------------------------------
// buildUpdatePayload
// ---------------------------------------------------------------------------

describe("buildUpdatePayload", () => {
  it("merges provided fields and stamps updatedBy/updatedAt", () => {
    const before = Date.now();
    const payload = buildUpdatePayload({ name: "New Name" }, "user_2");
    const after = Date.now();

    expect(payload.name).toBe("New Name");
    expect(payload.enabled).toBeUndefined();
    expect(payload.updatedBy).toBe("user_2");
    expect(payload.updatedAt).toBeGreaterThanOrEqual(before);
    expect(payload.updatedAt).toBeLessThanOrEqual(after);
  });

  it("passes through an empty patch without error", () => {
    const payload = buildUpdatePayload({}, "user_2");
    expect(payload.updatedBy).toBe("user_2");
    expect(payload.updatedAt).toBeTypeOf("number");
  });
});

// ---------------------------------------------------------------------------
// buildDisablePayload
// ---------------------------------------------------------------------------

describe("buildDisablePayload", () => {
  it("sets enabled to false", () => {
    const payload = buildDisablePayload("user_3");
    expect(payload.enabled).toBe(false);
  });

  it("stamps disabledBy and disabledAt", () => {
    const before = Date.now();
    const payload = buildDisablePayload("user_3");
    const after = Date.now();

    expect(payload.disabledBy).toBe("user_3");
    expect(payload.disabledAt).toBeGreaterThanOrEqual(before);
    expect(payload.disabledAt).toBeLessThanOrEqual(after);
  });

  it("stamps updatedBy and updatedAt consistently with disabledAt", () => {
    const payload = buildDisablePayload("user_3");
    expect(payload.updatedBy).toBe("user_3");
    expect(payload.updatedAt).toBe(payload.disabledAt);
  });
});

// ---------------------------------------------------------------------------
// buildEnablePayload
// ---------------------------------------------------------------------------

describe("buildEnablePayload", () => {
  it("sets enabled to true", () => {
    const payload = buildEnablePayload("user_4");
    expect(payload.enabled).toBe(true);
  });

  it("clears disabled metadata", () => {
    const payload = buildEnablePayload("user_4") as {
      disabledBy: string | null;
      disabledAt: number | null;
    };
    expect(payload.disabledBy).toBeNull();
    expect(payload.disabledAt).toBeNull();
  });

  it("stamps updatedBy and updatedAt", () => {
    const before = Date.now();
    const payload = buildEnablePayload("user_4");
    const after = Date.now();

    expect(payload.updatedBy).toBe("user_4");
    expect(payload.updatedAt).toBeGreaterThanOrEqual(before);
    expect(payload.updatedAt).toBeLessThanOrEqual(after);
  });
});
