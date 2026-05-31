import {
  authApiGetOrThrow,
  authApiPostOrThrow,
  authApiPatchOrThrow,
  authApiDeleteOrThrow,
  type ActiveScope,
} from "@id/lib";

// ─── OAuth2 clients (applications) ────────────────────────────────
// The OAuth2 endpoints speak snake_case (RFC 7591). `scope` is a
// space-delimited string, NOT an array. See workers/ui/docs/screens/oauth.md.

const platformScope: ActiveScope = { kind: "platform" };

function orgParams(scope: ActiveScope): { organizationId?: string } | undefined {
  return scope.kind === "organization" ? { organizationId: scope.organizationId } : undefined;
}

function scopedPath(path: string, scope: ActiveScope): string {
  if (scope.kind !== "organization") return path;
  return `${path}?organizationId=${encodeURIComponent(scope.organizationId)}`;
}

async function setActiveOrganizationForOAuth(scope: ActiveScope): Promise<void> {
  if (scope.kind === "organization") {
    await authApiPostOrThrow("/organization/set-active", { organizationId: scope.organizationId });
  }
}

export type OAuthClient = {
  client_id: string;
  client_secret?: string;
  client_secret_expires_at?: number;
  client_name: string;
  redirect_uris: string[];
  post_logout_redirect_uris?: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
  user_id?: string;
  client_id_issued_at?: number;
  client_uri?: string;
  logo_uri?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
  software_id?: string;
  software_version?: string;
  software_statement?: string;
  public?: boolean;
  type?: "web" | "native" | "user-agent-based";
  disabled?: boolean;
  skip_consent?: boolean;
  enable_end_session?: boolean;
  require_pkce?: boolean;
  subject_type?: "public" | "pairwise";
  reference_id?: string;
};

export type NonEmptyStringArray = [string, ...string[]];

export type CreateClientInput = {
  client_name?: string;
  token_endpoint_auth_method?: string;
  scope?: string;
  redirect_uris: NonEmptyStringArray;
  grant_types?: string[];
  response_types?: string[];
  post_logout_redirect_uris?: NonEmptyStringArray;
  client_uri?: string;
  logo_uri?: string;
  tos_uri?: string;
  policy_uri?: string;
  contacts?: NonEmptyStringArray;
  type?: "web" | "native" | "user-agent-based";
};

export type UpdateClientInput = Partial<{
  client_name: string;
  scope: string;
  redirect_uris: NonEmptyStringArray;
  post_logout_redirect_uris: NonEmptyStringArray;
  grant_types: string[];
  response_types: string[];
  client_uri: string;
  logo_uri: string;
  tos_uri: string;
  policy_uri: string;
  contacts: NonEmptyStringArray;
  software_id: string;
  software_version: string;
  software_statement: string;
  type: "web" | "native" | "user-agent-based";
}>;

export async function listClients(scope: ActiveScope = platformScope): Promise<OAuthClient[]> {
  await setActiveOrganizationForOAuth(scope);
  const clients = (await authApiGetOrThrow<OAuthClient[] | null>("/oauth2/get-clients")) ?? [];
  return scope.kind === "organization"
    ? clients.filter((client) => client.reference_id === scope.organizationId)
    : clients;
}

export async function createClient(data: CreateClientInput, scope: ActiveScope = platformScope): Promise<OAuthClient> {
  await setActiveOrganizationForOAuth(scope);
  return authApiPostOrThrow<OAuthClient>("/oauth2/create-client", data);
}

export async function updateClient(clientId: string, update: UpdateClientInput, scope: ActiveScope = platformScope): Promise<OAuthClient> {
  await setActiveOrganizationForOAuth(scope);
  return authApiPostOrThrow<OAuthClient>("/oauth2/update-client", { client_id: clientId, update });
}

export async function rotateClientSecret(clientId: string, scope: ActiveScope = platformScope): Promise<{ client_secret: string }> {
  await setActiveOrganizationForOAuth(scope);
  return authApiPostOrThrow<{ client_secret: string }>("/oauth2/client/rotate-secret", { client_id: clientId });
}

export async function deleteClient(clientId: string, scope: ActiveScope = platformScope): Promise<void> {
  await setActiveOrganizationForOAuth(scope);
  await authApiPostOrThrow("/oauth2/delete-client", { client_id: clientId });
}

// ─── Resource servers (audiences) ─────────────────────────────────
// Plugin entities use flat PATCH bodies and epoch-ms numeric timestamps.

export type ResourceServer = {
  id: string;
  organizationId: string | null;
  slug: string;
  name: string;
  audience: string;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  updatedBy: string;
  disabledAt: number | null;
  disabledBy: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CreateResourceServerInput = {
  name: string;
  slug: string;
  audience: string;
  description?: string;
  organizationId?: string;
};

export type UpdateResourceServerInput = Partial<{
  slug: string;
  name: string;
  audience: string;
  description: string | null;
}>;

export async function listResourceServers(scope: ActiveScope = platformScope): Promise<ResourceServer[]> {
  const res = await authApiGetOrThrow<{ resourceServers: ResourceServer[] }>("/admin/resource-servers", orgParams(scope));
  return res.resourceServers ?? [];
}

export async function createResourceServer(data: CreateResourceServerInput, scope: ActiveScope = platformScope): Promise<ResourceServer> {
  return authApiPostOrThrow<ResourceServer>("/admin/resource-servers", {
    ...data,
    ...(scope.kind === "organization" ? { organizationId: scope.organizationId } : {}),
  });
}

export async function updateResourceServer(id: string, data: UpdateResourceServerInput, scope: ActiveScope = platformScope): Promise<ResourceServer> {
  return authApiPatchOrThrow<ResourceServer>(scopedPath(`/admin/resource-servers/${id}`, scope), data);
}

export async function disableResourceServer(id: string, scope: ActiveScope = platformScope): Promise<ResourceServer> {
  return authApiPostOrThrow<ResourceServer>(scopedPath(`/admin/resource-servers/${id}/disable`, scope), {});
}

export async function enableResourceServer(id: string, scope: ActiveScope = platformScope): Promise<ResourceServer> {
  return authApiPostOrThrow<ResourceServer>(scopedPath(`/admin/resource-servers/${id}/enable`, scope), {});
}

export async function deleteResourceServer(id: string, scope: ActiveScope = platformScope): Promise<void> {
  await authApiDeleteOrThrow(scopedPath(`/admin/resource-servers/${id}`, scope));
}

// ─── OAuth resource scopes ────────────────────────────────────────

export type OAuthResourceScope = {
  id: string;
  resourceServerId: string;
  scope: string;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateScopeInput = {
  resourceServerId: string;
  scope: string;
  description?: string;
};

export type UpdateScopeInput = Partial<{
  scope: string;
  description: string | null;
  enabled: boolean;
}>;

export async function listScopes(scope: ActiveScope = platformScope): Promise<OAuthResourceScope[]> {
  const res = await authApiGetOrThrow<{ oauthScopes: OAuthResourceScope[] }>("/admin/oauth-scopes", orgParams(scope));
  return res.oauthScopes ?? [];
}

export async function createScope(data: CreateScopeInput, scope: ActiveScope = platformScope): Promise<OAuthResourceScope> {
  return authApiPostOrThrow<OAuthResourceScope>(scopedPath("/admin/oauth-scopes", scope), data);
}

export async function updateScope(id: string, data: UpdateScopeInput, scope: ActiveScope = platformScope): Promise<OAuthResourceScope> {
  return authApiPatchOrThrow<OAuthResourceScope>(scopedPath(`/admin/oauth-scopes/${id}`, scope), data);
}

// ─── M2M client-resource-scope bindings ───────────────────────────

export type ClientResourceScope = {
  id: string;
  clientId: string;
  resourceServerId: string;
  allowedScopes: string[];
  enabled: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateBindingInput = {
  clientId: string;
  resourceServerId: string;
  allowedScopes: string[];
};

export type UpdateBindingInput = Partial<{
  allowedScopes: string[];
  enabled: boolean;
}>;

export async function listBindings(scope: ActiveScope = platformScope): Promise<ClientResourceScope[]> {
  const res = await authApiGetOrThrow<{ oauthClientResourceScopes: ClientResourceScope[] }>(
    "/admin/oauth-client-resource-scopes",
    orgParams(scope),
  );
  return res.oauthClientResourceScopes ?? [];
}

export async function createBinding(data: CreateBindingInput, scope: ActiveScope = platformScope): Promise<ClientResourceScope> {
  return authApiPostOrThrow<ClientResourceScope>(scopedPath("/admin/oauth-client-resource-scopes", scope), data);
}

export async function updateBinding(id: string, data: UpdateBindingInput, scope: ActiveScope = platformScope): Promise<ClientResourceScope> {
  return authApiPatchOrThrow<ClientResourceScope>(scopedPath(`/admin/oauth-client-resource-scopes/${id}`, scope), data);
}

export async function deleteBinding(id: string, scope: ActiveScope = platformScope): Promise<void> {
  await authApiDeleteOrThrow(scopedPath(`/admin/oauth-client-resource-scopes/${id}`, scope));
}

// ─── Derived client type (no `type` enum at the boundary) ─────────

export type ClientType = "confidential" | "public" | "M2M";

/** Derive UI client type from grant_types + token_endpoint_auth_method. */
export function clientType(client: OAuthClient): ClientType {
  if (client.grant_types?.includes("client_credentials")) return "M2M";
  if (client.token_endpoint_auth_method === "none") return "public";
  return "confidential";
}
