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
