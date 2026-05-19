import type { BetterAuthPlugin } from "better-auth";

export const idResourceServer = (): BetterAuthPlugin => ({
  id: "id-resource-server",
  schema: {
    resourceServer: {
      fields: {
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
      },
    },
  },
  // endpoints added in Phase 5.3
});
