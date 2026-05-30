/**
 * Better Auth endpoint paths used as the first element of every admin SWR key.
 * Kept here (framework-free shared layer) so the path strings have a single
 * source of truth; the typed key builders live in `app/admin/_data/swr-keys.ts`.
 */
export const USERS_LIST = "/admin/list-users";
/** Single-user read, shared by the user-detail page and member enrichment. */
export const USER_DETAIL = "/admin/get-user";
/** Per-user session list. */
export const USER_SESSIONS = "/admin/list-user-sessions";
/** The acting admin's own session (impersonation state). */
export const CURRENT_SESSION = "/get-session";
/** Organizations list. */
export const ORGS_LIST = "/organization/list";
/** Full organization read for the org-detail page. */
export const ORG_DETAIL = "/organization/get-full-organization";
/** Organization member list. */
export const ORG_MEMBERS = "/organization/list-members";
/** Organization team list (plus member counts bundle). */
export const ORG_TEAMS = "/organization/list-teams";
/** Organization invitation list. */
export const ORG_INVITATIONS = "/organization/list-invitations";
/** OAuth2 client (application) list — snake_case OAuth2-formatted entities. */
export const OAUTH_CLIENTS = "/oauth2/get-clients";
/** OAuth resource server (audience) list. */
export const RESOURCE_SERVERS = "/admin/resource-servers";
/** OAuth resource scope catalog list. */
export const OAUTH_SCOPES = "/admin/oauth-scopes";
/** Per-client OAuth resource-scope (M2M) binding list. */
export const OAUTH_CLIENT_RESOURCE_SCOPES = "/admin/oauth-client-resource-scopes";
/** Public JWKS (RFC 7517) key set. */
export const JWKS = "/jwks";
/** Aggregate admin session listing (admin-audit plugin). */
export const ADMIN_SESSIONS = "/admin/list-sessions";
/** Aggregate admin OAuth token listing (admin-audit plugin). */
export const ADMIN_TOKENS = "/admin/list-tokens";
/** Aggregate admin OAuth consent listing (admin-audit plugin). */
export const ADMIN_CONSENTS = "/admin/list-consents";
/** Admin JWKS key metadata (admin-audit plugin; timestamps + status). */
export const ADMIN_JWKS = "/admin/jwks";
export const ADMIN_ACTIVITY_LOG = "/admin/activity-log";
