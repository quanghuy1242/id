import { describe, expect, it } from "vitest";
import {
  createResourceServerBody,
  createResourceServerOpenApiRequestBody,
  resourceServerBetterAuthFields,
  resourceServerOpenApiSchema,
  updateResourceServerBody,
} from "../../src/auth/plugins/resource-server/schema";

describe("createResourceServerBody", () => {
  it("accepts a valid create payload", () => {
    const result = createResourceServerBody.safeParse({
      organizationId: "org_1",
      slug: "api",
      name: "API",
      audience: "https://api.example.test",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optional description", () => {
    const result = createResourceServerBody.parse({
      organizationId: "org_1",
      slug: "api",
      name: "API",
      audience: "https://api.example.test",
      description: "The main API",
    });
    expect(result.description).toBe("The main API");
  });

  it("rejects caller-owned createdBy", () => {
    const result = createResourceServerBody.safeParse({
      organizationId: "org_1",
      slug: "api",
      name: "API",
      audience: "https://api.example.test",
      createdBy: "user_abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty organizationId", () => {
    const result = createResourceServerBody.safeParse({
      organizationId: "",
      slug: "api",
      name: "API",
      audience: "https://api.example.test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL audience", () => {
    const result = createResourceServerBody.safeParse({
      organizationId: "org_1",
      slug: "api",
      name: "API",
      audience: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const result = createResourceServerBody.safeParse({
      organizationId: "org_1",
      slug: "api",
      audience: "https://api.example.test",
      // name is missing
    });
    expect(result.success).toBe(false);
  });
});

describe("updateResourceServerBody", () => {
  it("accepts an empty patch (all fields optional)", () => {
    const result = updateResourceServerBody.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a partial patch", () => {
    const result = updateResourceServerBody.parse({ name: "New Name" });
    expect(result.name).toBe("New Name");
    expect(result.enabled).toBeUndefined();
  });

  it("rejects direct enabled toggles", () => {
    const result = updateResourceServerBody.safeParse({ enabled: false });
    expect(result.success).toBe(false);
  });

  it("accepts a nullable description to clear it", () => {
    const result = updateResourceServerBody.safeParse({ description: null });
    expect(result.success).toBe(true);
  });

  it("rejects an empty slug string", () => {
    const result = updateResourceServerBody.safeParse({ slug: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL audience", () => {
    const result = updateResourceServerBody.safeParse({ audience: "not-a-url" });
    expect(result.success).toBe(false);
  });
});

describe("resourceServerBetterAuthFields", () => {
  it("matches the Better Auth table field contract", () => {
    expect(resourceServerBetterAuthFields).toEqual({
      organizationId: { type: "string", required: true, references: { model: "organization", field: "id" } },
      slug: { type: "string", required: true },
      name: { type: "string", required: true },
      audience: { type: "string", required: true, unique: true },
      description: { type: "string", required: false },
      enabled: { type: "boolean", required: true, defaultValue: true },
      createdBy: { type: "string", required: false },
      updatedBy: { type: "string", required: false },
      disabledAt: { type: "number", required: false },
      disabledBy: { type: "string", required: false },
      createdAt: { type: "number", required: true },
      updatedAt: { type: "number", required: true },
    });
  });
});

describe("resource server OpenAPI schemas", () => {
  it("does not expose Better Auth-only field metadata", () => {
    expect(JSON.stringify(resourceServerOpenApiSchema)).not.toContain("betterAuth");
  });

  it("documents create description as optional string, not nullable", () => {
    const schema = createResourceServerOpenApiRequestBody.content["application/json"].schema;
    expect(schema).toEqual(
      expect.objectContaining({
        required: ["organizationId", "slug", "name", "audience"],
      }),
    );
    expect(schema).toHaveProperty(["properties", "description", "type"], "string");
  });
});
