import type { Arguments } from "swr";
import type { ListUsersParams } from "../_actions/users";
import {
  USERS_LIST,
  USER_DETAIL,
  USER_SESSIONS,
  CURRENT_SESSION,
  ORGS_LIST,
  ORG_DETAIL,
  ORG_MEMBERS,
  ORG_TEAMS,
  ORG_INVITATIONS,
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

/** Server params only — the caller passes the debounced search, never raw input. */
export const usersListKey = (params: ListUsersParams) => [USERS_LIST, params] as const;
export const userDetailKey = (id: string) => [USER_DETAIL, { id }] as const;
export const userSessionsKey = (userId: string) => [USER_SESSIONS, { userId }] as const;
export const currentSessionKey = () => [CURRENT_SESSION] as const;
export const orgsListKey = () => [ORGS_LIST] as const;
export const orgDetailKey = (organizationId: string) => [ORG_DETAIL, { organizationId }] as const;
export const orgMembersKey = (organizationId: string) => [ORG_MEMBERS, { organizationId }] as const;
export const orgTeamsKey = (organizationId: string) => [ORG_TEAMS, { organizationId }] as const;
export const orgInvitationsKey = (organizationId: string) => [ORG_INVITATIONS, { organizationId }] as const;

/** Matches every users-list cache slot regardless of filter/sort/page params. */
export const isUsersListKey = (key: Arguments) => Array.isArray(key) && key[0] === USERS_LIST;
/** Matches the organizations-list cache slot. */
export const isOrgsListKey = (key: Arguments) => Array.isArray(key) && key[0] === ORGS_LIST;
