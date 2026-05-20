import { z } from "zod";

/** Validated body for the create-resource-server endpoint. */
export const createResourceServerBody = z.object({
  organizationId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  audience: z.url(),
  description: z.string().optional(),
  createdBy: z.string().optional(),
});

/** Validated body for the update-resource-server endpoint. */
export const updateResourceServerBody = z.object({
  slug: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  audience: z.url().optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export type CreateResourceServerBody = z.infer<typeof createResourceServerBody>;
export type UpdateResourceServerBody = z.infer<typeof updateResourceServerBody>;
