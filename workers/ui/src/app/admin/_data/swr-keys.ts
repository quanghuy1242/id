import type { Arguments } from "swr";
import type { ActiveScope } from "@id/lib";
import type { ListUsersParams } from "../_actions/users";
import {
  USERS_LIST,
  USER_DETAIL,
  USER_SESSIONS,
  CURRENT_SESSION,
  CONSOLE_SCOPES,
  ACCESS_ADMINS_ROLES,
  ORGS_LIST,
  ORG_DETAIL,
  ORG_MEMBERS,
  ORG_TEAMS,
  ORG_INVITATIONS,
  OAUTH_CLIENTS,
  RESOURCE_SERVERS,
  OAUTH_SCOPES,
  OAUTH_CLIENT_RESOURCE_SCOPES,
  JWKS,
  ADMIN_SESSIONS,
  ADMIN_TOKENS,
  ADMIN_CONSENTS,
  ADMIN_JWKS,
  ADMIN_ACTIVITY_LOG,
} from "@/shared/swr-endpoints";

/**
 * Typed SWR cache-key builders and invalidation predicates for the admin data
 * layer.
 *
 * The key is the cache-identity contract (see `docs/025`): it must contain
 * exactly the server-side params that change the response — never client-side
 * view state (e.g. the users status filter, or the orgs client-side
 * search/sort). Keys are tuples `[endpointPath, params?]`; SWR hashes them
 * structurally, so the same logical key always resolves to the same cache slot.
 */

const platformScope: ActiveScope = { kind: "platform" };

/** Server params only — the caller passes the debounced search, never raw input. */
export const usersListKey = (params: ListUsersParams) => [USERS_LIST, params] as const;
export const userDetailKey = (id: string) => [USER_DETAIL, { id }] as const;
export const userSessionsKey = (userId: string) => [USER_SESSIONS, { userId }] as const;
export const currentSessionKey = () => [CURRENT_SESSION] as const;
export const consoleScopesKey = () => [CONSOLE_SCOPES] as const;
export const adminsRolesKey = () => [ACCESS_ADMINS_ROLES] as const;
export const orgsListKey = () => [ORGS_LIST] as const;
export const orgDetailKey = (organizationId: string) => [ORG_DETAIL, { organizationId }] as const;
export const orgMembersKey = (organizationId: string) => [ORG_MEMBERS, { organizationId }] as const;
export const orgTeamsKey = (organizationId: string) => [ORG_TEAMS, { organizationId }] as const;
export const orgInvitationsKey = (organizationId: string) => [ORG_INVITATIONS, { organizationId }] as const;

/**
 * OAuth & security keys. Each list is fetched once and filtered/sorted
 * client-side (no server-side search/pagination on these plugin endpoints),
 * so every builder is keyless — the cache slot is identified by the endpoint
 * path alone.
 */
export const oauthClientsKey = (scope: ActiveScope = platformScope) => [OAUTH_CLIENTS, scope] as const;
export const resourceServersKey = (scope: ActiveScope = platformScope) => [RESOURCE_SERVERS, scope] as const;
export const oauthScopesKey = (scope: ActiveScope = platformScope) => [OAUTH_SCOPES, scope] as const;
export const m2mBindingsKey = (scope: ActiveScope = platformScope) => [OAUTH_CLIENT_RESOURCE_SCOPES, scope] as const;
export const jwksKey = () => [JWKS] as const;

/** Aggregate audit keys — server params (page window, type, client filter) only. */
export const adminSessionsKey = (params: { limit: number; offset: number }) => [ADMIN_SESSIONS, params] as const;
export const adminTokensKey = (params: { limit: number; offset: number; type: string }) => [ADMIN_TOKENS, params] as const;
export const adminConsentsKey = (params: { limit: number; offset: number; clientId?: string }) => [ADMIN_CONSENTS, params] as const;
export const adminJwksKey = () => [ADMIN_JWKS] as const;
export const activityLogKey = (params: { targetType: string; targetId: string; action?: string; actorId?: string; limit: number; offset: number }) => [ADMIN_ACTIVITY_LOG, params] as const;

/** Matches every users-list cache slot regardless of filter/sort/page params. */
export const isUsersListKey = (key: Arguments) => Array.isArray(key) && key[0] === USERS_LIST;
/** Matches the organizations-list cache slot. */
export const isOrgsListKey = (key: Arguments) => Array.isArray(key) && key[0] === ORGS_LIST;
/** Matches the OAuth clients list cache slot. */
export const isOauthClientsKey = (key: Arguments) => Array.isArray(key) && key[0] === OAUTH_CLIENTS;
/** Matches the resource-servers list cache slot. */
export const isResourceServersKey = (key: Arguments) => Array.isArray(key) && key[0] === RESOURCE_SERVERS;
/** Matches the OAuth scopes list cache slot. */
export const isOauthScopesKey = (key: Arguments) => Array.isArray(key) && key[0] === OAUTH_SCOPES;
/** Matches the M2M bindings list cache slot. */
export const isM2mBindingsKey = (key: Arguments) => Array.isArray(key) && key[0] === OAUTH_CLIENT_RESOURCE_SCOPES;
/** Matches every activity-log cache slot regardless of target/filter/page params. */
export const isActivityLogKey = (key: Arguments) => Array.isArray(key) && key[0] === ADMIN_ACTIVITY_LOG;
