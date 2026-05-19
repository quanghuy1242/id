import { authPluginConfig } from "./config";

export type AuthRouteContract = {
  readonly name: string;
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly source: "better-auth" | "jwt-plugin" | "oauth-provider-plugin" | "id-resource-server-plugin";
};

export const authRouteMap = [
  { name: "signUpEmail", path: "/api/auth/sign-up/email", method: "POST", source: "better-auth" },
  { name: "getJwks", path: "/api/auth/jwks", method: "GET", source: "jwt-plugin" },
  { name: "oauth2Authorize", path: "/api/auth/oauth2/authorize", method: "GET", source: "oauth-provider-plugin" },
  { name: "oauth2Token", path: "/api/auth/oauth2/token", method: "POST", source: "oauth-provider-plugin" },
  { name: "oauth2UserInfo", path: "/api/auth/oauth2/userinfo", method: "GET", source: "oauth-provider-plugin" },
  { name: "createOAuthClient", path: "/api/auth/oauth2/create-client", method: "POST", source: "oauth-provider-plugin" },
  { name: "updateOAuthClient", path: "/api/auth/oauth2/update-client", method: "POST", source: "oauth-provider-plugin" },
  { name: "deleteOAuthClient", path: "/api/auth/oauth2/delete-client", method: "POST", source: "oauth-provider-plugin" },
  {
    name: "createResourceServer",
    path: "/api/auth/admin/resource-servers",
    method: "POST",
    source: "id-resource-server-plugin",
  },
] as const satisfies readonly AuthRouteContract[];

export function publicAuthPath(path: string): string {
  return `${authPluginConfig.issuerPath}${path}`;
}
