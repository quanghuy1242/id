import { z } from "zod";
import { ADMIN_TYPEAHEAD_MAX_LIST_LIMIT } from "../../../shared/constants";
import { zodSchemaToOpenApi } from "../../openapi";

const publicOAuthClientSchema = z
  .object({
    client_id: z.string(),
    client_name: z.string().nullable(),
    type: z.string().nullable(),
    grant_types: z.array(z.string()),
    response_types: z.array(z.string()),
    redirect_uris: z.array(z.string()),
    scope: z.string(),
    token_endpoint_auth_method: z.string().nullable(),
    reference_id: z.string().nullable(),
    disabled: z.boolean(),
    created_at: z.number().nullable(),
  })
  .meta({ id: "PublicOAuthClient" });

export const listOAuthClientsOpenApiSchema = zodSchemaToOpenApi(
  z.object({
    items: z.array(publicOAuthClientSchema),
    total: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  }),
);

export function oauthClientAdminEndpointMeta(options: {
  description: string;
  responseSchema?: Record<string, unknown>;
  responseDescription?: string;
}) {
  const responses: Record<
    string,
    {
      description: string;
      content?: { "application/json"?: { schema: Record<string, unknown> } };
    }
  > = {};
  if (options.responseSchema) {
    responses["200"] = {
      description: options.responseDescription ?? "Success",
      content: { "application/json": { schema: options.responseSchema } },
    };
  }
  return {
    openapi: {
      tags: ["OAuth Client Admin"],
      description: options.description,
      parameters: [
        {
          name: "organizationId",
          in: "query" as const,
          required: false,
          schema: { type: "string" as const },
        },
        {
          name: "q",
          in: "query" as const,
          required: false,
          schema: { type: "string" as const },
        },
        {
          name: "limit",
          in: "query" as const,
          required: false,
          schema: {
            type: "integer" as const,
            minimum: 1,
            maximum: ADMIN_TYPEAHEAD_MAX_LIST_LIMIT,
          },
        },
        {
          name: "offset",
          in: "query" as const,
          required: false,
          schema: { type: "integer" as const, minimum: 0 },
        },
        {
          name: "ids",
          in: "query" as const,
          required: false,
          schema: { type: "string" as const },
        },
      ],
      responses,
    },
  };
}
