import { z } from "zod";
import { zodSchemaToOpenApi } from "../../openapi";

export const validateUserPrincipalBody = z
  .object({
    userId: z.string().min(1).meta({ description: "id user ID to validate" }),
  })
  .strict();

export const validateUserInOrganizationPrincipalBody = z
  .object({
    userId: z.string().min(1).meta({ description: "id user ID to validate" }),
    organizationId: z.string().min(1).meta({ description: "Organization ID the user must be a current member of" }),
  })
  .strict();

export const validateTeamInOrganizationPrincipalBody = z
  .object({
    teamId: z.string().min(1).meta({ description: "id team ID to validate" }),
    organizationId: z.string().min(1).meta({ description: "Organization ID the team must belong to" }),
  })
  .strict();

export const validateServiceAccountForOrganizationPrincipalBody = z
  .object({
    clientId: z.string().min(1).meta({ description: "OAuth client ID / service-account principal ID" }),
    organizationId: z.string().min(1).meta({ description: "Organization ID the client must be eligible for" }),
    resource: z.url().meta({ description: "Public OAuth resource audience of the target resource API" }),
  })
  .strict();

export const validateOrganizationAdministratorPrincipalBody = z
  .object({
    userId: z.string().min(1).meta({ description: "id user ID to validate" }),
    organizationId: z.string().min(1).meta({ description: "Organization ID the user must be a current owner/admin of" }),
  })
  .strict();

const principalValidationResponseSchema = z
  .object({
    valid: z.boolean().meta({ description: "Whether the principal is valid for the requested condition" }),
  })
  .meta({ id: "PrincipalValidationResponse" });

export const principalValidationResponseOpenApiSchema = zodSchemaToOpenApi(principalValidationResponseSchema);

function openApiJsonRequestBody(schema: z.ZodTypeAny) {
  return { required: true, content: { "application/json": { schema: zodSchemaToOpenApi(schema) } } };
}

export type PrincipalValidationEndpointMetaOptions = {
  description: string;
  requestSchema: z.ZodTypeAny;
};

export function principalValidationEndpointMeta(options: PrincipalValidationEndpointMetaOptions) {
  return {
    openapi: {
      tags: ["Principal Validation"],
      description: options.description,
      requestBody: openApiJsonRequestBody(options.requestSchema),
      responses: {
        "200": {
          description: "Principal validated successfully",
          content: { "application/json": { schema: principalValidationResponseOpenApiSchema } },
        },
      },
    },
  };
}
