import { authPluginConfig } from "../../../src/auth/config";

export type AuthRouteContract = {
  readonly name: string;
  readonly path: string;
  readonly method: "DELETE" | "GET" | "PATCH" | "POST";
  readonly source:
    | "better-auth"
    | "jwt-plugin"
    | "oauth-provider-plugin"
    | "id-resource-server-plugin"
    | "id-console-scopes-plugin"
    | "id-admin-delegation-plugin"
    | "open-api-plugin";
};

function publicAuthPath(path: string): string {
  return `${authPluginConfig.issuerPath}${path}`;
}

export const authRouteMap = [
  {
    name: "signUpEmail",
    path: publicAuthPath("/sign-up/email"),
    method: "POST",
    source: "better-auth",
  },
  {
    name: "getJwks",
    path: publicAuthPath("/jwks"),
    method: "GET",
    source: "jwt-plugin",
  },
  {
    name: "oauth2Authorize",
    path: publicAuthPath("/oauth2/authorize"),
    method: "GET",
    source: "oauth-provider-plugin",
  },
  {
    name: "oauth2Token",
    path: publicAuthPath("/oauth2/token"),
    method: "POST",
    source: "oauth-provider-plugin",
  },
  {
    name: "oauth2Introspect",
    path: publicAuthPath("/oauth2/introspect"),
    method: "POST",
    source: "oauth-provider-plugin",
  },
  {
    name: "oauth2Revoke",
    path: publicAuthPath("/oauth2/revoke"),
    method: "POST",
    source: "oauth-provider-plugin",
  },
  {
    name: "oauth2UserInfo",
    path: publicAuthPath("/oauth2/userinfo"),
    method: "GET",
    source: "oauth-provider-plugin",
  },
  {
    name: "getOAuthServerConfig",
    path: publicAuthPath("/.well-known/oauth-authorization-server"),
    method: "GET",
    source: "oauth-provider-plugin",
  },
  {
    name: "getOpenIdConfig",
    path: publicAuthPath("/.well-known/openid-configuration"),
    method: "GET",
    source: "oauth-provider-plugin",
  },
  {
    name: "createOAuthClient",
    path: publicAuthPath("/oauth2/create-client"),
    method: "POST",
    source: "oauth-provider-plugin",
  },
  {
    name: "getOAuthClients",
    path: publicAuthPath("/oauth2/get-clients"),
    method: "GET",
    source: "oauth-provider-plugin",
  },
  {
    name: "updateOAuthClient",
    path: publicAuthPath("/oauth2/update-client"),
    method: "POST",
    source: "oauth-provider-plugin",
  },
  {
    name: "deleteOAuthClient",
    path: publicAuthPath("/oauth2/delete-client"),
    method: "POST",
    source: "oauth-provider-plugin",
  },
  {
    name: "rotateClientSecret",
    path: publicAuthPath("/oauth2/client/rotate-secret"),
    method: "POST",
    source: "oauth-provider-plugin",
  },
  {
    name: "generateOpenAPISchema",
    path: publicAuthPath("/open-api/generate-schema"),
    method: "GET",
    source: "open-api-plugin",
  },
  {
    name: "openAPIReference",
    path: publicAuthPath("/reference"),
    method: "GET",
    source: "open-api-plugin",
  },
  {
    name: "createResourceServer",
    path: publicAuthPath("/admin/resource-servers"),
    method: "POST",
    source: "id-resource-server-plugin",
  },
  {
    name: "listResourceServers",
    path: publicAuthPath("/admin/resource-servers"),
    method: "GET",
    source: "id-resource-server-plugin",
  },
  {
    name: "getResourceServer",
    path: publicAuthPath("/admin/resource-servers/:id"),
    method: "GET",
    source: "id-resource-server-plugin",
  },
  {
    name: "updateResourceServer",
    path: publicAuthPath("/admin/resource-servers/:id"),
    method: "PATCH",
    source: "id-resource-server-plugin",
  },
  {
    name: "deleteResourceServer",
    path: publicAuthPath("/admin/resource-servers/:id"),
    method: "DELETE",
    source: "id-resource-server-plugin",
  },
  {
    name: "disableResourceServer",
    path: publicAuthPath("/admin/resource-servers/:id/disable"),
    method: "POST",
    source: "id-resource-server-plugin",
  },
  {
    name: "getConsoleScopes",
    path: publicAuthPath("/admin/console-scopes"),
    method: "GET",
    source: "id-console-scopes-plugin",
  },
  {
    name: "listAdminRoles",
    path: publicAuthPath("/admin/delegation/roles"),
    method: "GET",
    source: "id-admin-delegation-plugin",
  },
  {
    name: "createAdminRole",
    path: publicAuthPath("/admin/delegation/roles"),
    method: "POST",
    source: "id-admin-delegation-plugin",
  },
  {
    name: "updateAdminRole",
    path: publicAuthPath("/admin/delegation/roles/:id"),
    method: "PATCH",
    source: "id-admin-delegation-plugin",
  },
  {
    name: "listAdminRoleBindings",
    path: publicAuthPath("/admin/delegation/bindings"),
    method: "GET",
    source: "id-admin-delegation-plugin",
  },
  {
    name: "createAdminRoleBinding",
    path: publicAuthPath("/admin/delegation/bindings"),
    method: "POST",
    source: "id-admin-delegation-plugin",
  },
  {
    name: "deleteAdminRoleBinding",
    path: publicAuthPath("/admin/delegation/bindings/:id"),
    method: "DELETE",
    source: "id-admin-delegation-plugin",
  },
] as const satisfies readonly AuthRouteContract[];
