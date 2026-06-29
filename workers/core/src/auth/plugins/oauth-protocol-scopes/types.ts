/**
 * Option type for the `id-oauth-protocol-scopes` plugin. Kept in this file so
 * the architecture/auth-plugin-folder-shape linter is satisfied and so the
 * factory in `index.ts` stays focused on the hook wiring.
 */
export interface IdOAuthProtocolScopesOptions {
  /**
   * The always-available OIDC protocol scopes (e.g.
   * `authPluginConfig.oauthProtocolScopes`) to fold into every client's
   * registered scope set.
   */
  readonly protocolScopes: readonly string[];
}
