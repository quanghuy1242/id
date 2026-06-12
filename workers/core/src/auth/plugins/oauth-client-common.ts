import {
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  RESOURCE_SERVER_MODEL,
} from "../../shared/constants";

export type QueryWhere = {
  readonly field: string;
  readonly value: unknown;
  readonly operator?: string;
};

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

export type OAuthClientQueryAdapter = {
  readonly findOne: <T>(query: {
    model: string;
    where: QueryWhere[];
  }) => Promise<T | null>;
  readonly findMany: <T>(query: {
    model: string;
    where?: QueryWhere[];
    limit?: number;
    offset?: number;
    sortBy?: { field: string; direction: "asc" | "desc" };
  }) => Promise<T[]>;
  readonly count: (query: {
    model: string;
    where?: QueryWhere[];
  }) => Promise<number | bigint>;
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

export type PublicOAuthClient = {
  readonly client_id: string;
  readonly client_name: string | null;
  readonly type: string | null;
  readonly grant_types: readonly string[];
  readonly response_types: readonly string[];
  readonly redirect_uris: readonly string[];
  readonly scope: string;
  readonly token_endpoint_auth_method: string | null;
  readonly reference_id: string | null;
  readonly disabled: boolean;
  readonly created_at: number | null;
};

export type OAuthClientPageParams = {
  readonly organizationId?: string;
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly ids?: readonly string[];
};

export type OAuthClientPage = {
  readonly items: readonly PublicOAuthClient[];
  readonly total?: number;
  readonly limit?: number;
  readonly offset?: number;
};

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

/** Resolves advisory runtime eligibility for a tenant client at one public resource audience. */
export async function resolveResourceAccess(
  adapter: OAuthClientQueryAdapter,
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
  if (!resourceServer) return { resource, status: "missing" };

  const clientResource = await adapter.findOne<ClientResourceScopeRow>({
    model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
    where: [
      { field: "clientId", value: clientId },
      { field: "resourceServerId", value: resourceServer.id },
    ],
  });
  if (!clientResource) return { resource, status: "missing" };
  return {
    resource,
    status:
      resourceServer.enabled === false || clientResource.enabled === false
        ? "disabled"
        : "enabled",
  };
}

export function presentPublicOAuthClient(
  row: OAuthClientRow,
): PublicOAuthClient {
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
  };
}

/** Presents non-secret OAuth client metadata with optional advisory resource eligibility. */
export function presentClientLookup(
  row: OAuthClientRow,
  resourceAccess?: ResourceAccess,
): Record<string, unknown> {
  return {
    ...presentPublicOAuthClient(row),
    ...(resourceAccess ? { resource_access: resourceAccess } : {}),
  };
}

export async function listPublicOAuthClients(
  adapter: OAuthClientQueryAdapter,
  model: string,
  params: OAuthClientPageParams,
): Promise<OAuthClientPage> {
  const where: QueryWhere[] = [];
  if (params.organizationId)
    where.push({ field: "referenceId", value: params.organizationId });

  if (params.ids?.length) {
    const rows = await adapter.findMany<OAuthClientRow>({
      model,
      where: [
        ...where,
        { field: "clientId", value: [...params.ids], operator: "in" },
      ],
      sortBy: { field: "createdAt", direction: "desc" },
    });
    return { items: rows.map(presentPublicOAuthClient) };
  }

  if (params.q)
    where.push({ field: "name", value: params.q, operator: "contains" });
  const filters = where.length > 0 ? where : undefined;
  const total = Number(await adapter.count({ model, where: filters }));
  const rows = await adapter.findMany<OAuthClientRow>({
    model,
    where: filters,
    limit: params.limit,
    offset: params.offset,
    sortBy: { field: "createdAt", direction: "desc" },
  });
  return {
    items: rows.map(presentPublicOAuthClient),
    total,
    limit: params.limit,
    offset: params.offset,
  };
}
