import {
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  RESOURCE_SERVER_MODEL,
} from "../../../shared/constants";

export type OAuthClientRow = {
  readonly id: string;
  readonly clientId: string;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly grantTypes?: readonly string[] | string | null;
  readonly responseTypes?: readonly string[] | string | null;
  readonly redirectUris?: readonly string[] | string | null;
  readonly scopes?: readonly string[] | string | null;
  readonly tokenEndpointAuthMethod?: string | null;
  readonly referenceId?: string | null;
  readonly disabled?: boolean | null;
  readonly createdAt?: number | null;
};

export type PickerAdapter = {
  readonly findOne: <T>(query: {
    model: string;
    where: { field: string; value: unknown }[];
  }) => Promise<T | null>;
  readonly findMany: <T>(query: { model: string }) => Promise<T[]>;
};

type ResourceServerRow = {
  readonly id: string;
  readonly organizationId?: string | null;
  readonly enabled?: boolean | null;
};

type ClientResourceScopeRow = {
  readonly enabled?: boolean | null;
};

export type ResourceAccess = Readonly<{
  resource: string;
  status: "enabled" | "disabled" | "missing";
}>;

function parseList(value: OAuthClientRow["grantTypes"]): readonly string[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed.filter(
          (entry): entry is string => typeof entry === "string",
        );
      if (typeof parsed === "string") return parsed.split(" ").filter(Boolean);
    } catch {
      return value.split(" ").filter(Boolean);
    }
  }
  return [];
}

/**
 * Resolves advisory runtime eligibility for a tenant client at one public
 * resource audience.
 *
 * The lookup deliberately collapses unknown, system-layer, and other-tenant
 * resources to `missing` so the system M2M caller cannot use this endpoint to
 * enumerate resource-server registrations outside the stated tenant context.
 * Token issuance independently enforces the authoritative access decision.
 */
export async function resolveResourceAccess(
  adapter: PickerAdapter,
  clientId: string,
  organizationId: string,
  resource: string,
): Promise<ResourceAccess> {
  const resourceServer = await adapter.findOne<ResourceServerRow>({
    model: RESOURCE_SERVER_MODEL,
    where: [
      { field: "audience", value: resource },
      { field: "organizationId", value: organizationId },
    ],
  });
  if (!resourceServer) {
    return { resource, status: "missing" };
  }

  const clientResource = await adapter.findOne<ClientResourceScopeRow>({
    model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
    where: [
      { field: "clientId", value: clientId },
      { field: "resourceServerId", value: resourceServer.id },
    ],
  });
  if (!clientResource) {
    return { resource, status: "missing" };
  }
  return {
    resource,
    status:
      resourceServer.enabled === false || clientResource.enabled === false
        ? "disabled"
        : "enabled",
  };
}

/** Presents non-secret OAuth client metadata with optional advisory resource eligibility. */
export function presentClientLookup(
  row: OAuthClientRow,
  resourceAccess?: ResourceAccess,
): Record<string, unknown> {
  return {
    client_id: row.clientId,
    client_name: row.name ?? null,
    type: row.type ?? null,
    grant_types: parseList(row.grantTypes),
    response_types: parseList(row.responseTypes),
    redirect_uris: parseList(row.redirectUris),
    scope: parseList(row.scopes).join(" "),
    token_endpoint_auth_method: row.tokenEndpointAuthMethod ?? null,
    reference_id: row.referenceId ?? null,
    disabled: Boolean(row.disabled),
    created_at: row.createdAt ?? null,
    ...(resourceAccess ? { resource_access: resourceAccess } : {}),
  };
}
