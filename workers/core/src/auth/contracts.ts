import { authPluginConfig } from "./config";

export type AuthRouteContract = {
  readonly name: string;
  readonly path: string;
  readonly method: "DELETE" | "GET" | "PATCH" | "POST";
  readonly source: "better-auth" | "jwt-plugin" | "oauth-provider-plugin" | "id-resource-server-plugin";
};

export const authRouteMap = [
  { name: "signUpEmail", path: "/api/auth/sign-up/email", method: "POST", source: "better-auth" },
  { name: "getJwks", path: "/api/auth/jwks", method: "GET", source: "jwt-plugin" },
  { name: "oauth2Authorize", path: "/api/auth/oauth2/authorize", method: "GET", source: "oauth-provider-plugin" },
  { name: "oauth2Token", path: "/api/auth/oauth2/token", method: "POST", source: "oauth-provider-plugin" },
  { name: "oauth2Introspect", path: "/api/auth/oauth2/introspect", method: "POST", source: "oauth-provider-plugin" },
  { name: "oauth2Revoke", path: "/api/auth/oauth2/revoke", method: "POST", source: "oauth-provider-plugin" },
  { name: "oauth2UserInfo", path: "/api/auth/oauth2/userinfo", method: "GET", source: "oauth-provider-plugin" },
  {
    name: "getOAuthServerConfig",
    path: "/api/auth/.well-known/oauth-authorization-server",
    method: "GET",
    source: "oauth-provider-plugin",
  },
  {
    name: "getOpenIdConfig",
    path: "/api/auth/.well-known/openid-configuration",
    method: "GET",
    source: "oauth-provider-plugin",
  },
  { name: "createOAuthClient", path: "/api/auth/oauth2/create-client", method: "POST", source: "oauth-provider-plugin" },
  { name: "getOAuthClients", path: "/api/auth/oauth2/get-clients", method: "GET", source: "oauth-provider-plugin" },
  { name: "updateOAuthClient", path: "/api/auth/oauth2/update-client", method: "POST", source: "oauth-provider-plugin" },
  { name: "deleteOAuthClient", path: "/api/auth/oauth2/delete-client", method: "POST", source: "oauth-provider-plugin" },
  {
    name: "rotateClientSecret",
    path: "/api/auth/oauth2/client/rotate-secret",
    method: "POST",
    source: "oauth-provider-plugin",
  },
  {
    name: "createResourceServer",
    path: "/api/auth/admin/resource-servers",
    method: "POST",
    source: "id-resource-server-plugin",
  },
  {
    name: "listResourceServers",
    path: "/api/auth/admin/resource-servers",
    method: "GET",
    source: "id-resource-server-plugin",
  },
  {
    name: "getResourceServer",
    path: "/api/auth/admin/resource-servers/:id",
    method: "GET",
    source: "id-resource-server-plugin",
  },
  {
    name: "updateResourceServer",
    path: "/api/auth/admin/resource-servers/:id",
    method: "PATCH",
    source: "id-resource-server-plugin",
  },
  {
    name: "deleteResourceServer",
    path: "/api/auth/admin/resource-servers/:id",
    method: "DELETE",
    source: "id-resource-server-plugin",
  },
  {
    name: "disableResourceServer",
    path: "/api/auth/admin/resource-servers/:id/disable",
    method: "POST",
    source: "id-resource-server-plugin",
  },
] as const satisfies readonly AuthRouteContract[];

export function publicAuthPath(path: string): string {
  return `${authPluginConfig.issuerPath}${path}`;
}
