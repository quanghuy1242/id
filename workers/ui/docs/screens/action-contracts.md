# Admin Action Contracts

This document records the request and response contracts for `workers/ui/src/app/admin/_actions/*`. It exists because Better Auth's exported OpenAPI can lag or differ from the runtime handlers; for admin UI work, the runtime contract wins.

## Source Of Truth

Use this order when adding or changing an action:

1. Repo-owned plugins: read `workers/core/src/auth/plugins/**/schema.ts` and `workers/core/src/auth/plugins/**/index.ts`.
2. Better Auth runtime routes: read the installed package source under `node_modules/better-auth/dist/**` or the package-specific runtime such as `node_modules/@better-auth/oauth-provider/dist/index.mjs`.
3. Generated OpenAPI: use it as a discovery index only when it agrees with runtime source.
4. UI `_actions`: normalize runtime quirks here, not inside content components.
5. `_mocks` and stories: keep them on the UI-normalized shapes, plus add raw-wire fixtures when a mismatch is known.
6. Tests: add contract tests in `workers/ui/tests/pages/*actions*.test.ts` before any barrel import that globally mocks `@idco/lib`.

## Boundary Rules

- `_actions` functions call only the typed `@idco/lib` auth helpers; no component or route file calls `/api/auth` directly.
- Snake-case OAuth client management fields stay snake_case through `_actions` because the OAuth provider route is RFC 7591-shaped.
- Better Auth admin and organization mutations are POST endpoints even when their semantic action is update, delete, revoke, or remove.
- Repo-owned OAuth admin plugins use REST verbs for their plugin-owned endpoints: `PATCH` for flat updates and `DELETE` for deletes.
- Optional array fields with Better Auth `min(1)` schemas are omitted when empty; sending `[]` is a request-shape bug.
- Runtime responses that are raw objects or nullable values are normalized in `_actions` when screens expect an envelope or list.
- The shared `@idco/lib` `*OrThrow` helpers normalize Better Auth and OAuth error bodies to a display-safe `AuthApiError`; alerts should render `error.message`, not raw response JSON.
- Browser UI must never consume live Better Auth session tokens. Use the repo-owned `admin-audit` list/revoke-by-id endpoints for session rows; Better Auth's `revoke-user-session` route is server-side only because it requires a bearer token.

## Audit Actions

| Action | Endpoint | Request Shape | Runtime Response | UI Action Contract |
|---|---|---|---|---|
| `listAdminSessions` | GET `/admin/list-sessions` | query `{ limit, offset, userId? }` | `{ sessions, total, limit, offset }` with no `token` field | Returns the plugin envelope unchanged; session rows expose ids only, never bearer tokens. |
| `revokeAdminSession` | POST `/admin/revoke-session` | JSON `{ sessionId }` | `{ success: true }` | Resolves `void`; the auth worker resolves the token internally. |
| `listAdminTokens` | GET `/admin/list-tokens` | query `{ limit, offset, type }` | `{ tokens, total, limit, offset }` | Returns the plugin envelope unchanged. |
| `listAdminConsents` | GET `/admin/list-consents` | query `{ limit, offset, clientId?, organizationId? }` | `{ consents, total, limit, offset }` | Returns the plugin envelope unchanged; `organizationId` bounds rows to org-owned clients. |
| `revokeConsent` | POST `/admin/revoke-consent` | JSON `{ clientId, userId, organizationId? }` | `{ success: true }` | Resolves `void`; org calls include `organizationId` so the auth worker verifies client ownership before delete. |
| `listAdminJwks` | GET `/admin/jwks` | none | `{ keys }` | Unwraps to `AdminJwk[]`, defaulting missing keys to `[]`. |
| `rotateAdminJwks` | POST `/admin/jwks/rotate` | JSON `{ reason }` | `AdminJwk & { reason }` | Returns the rotate result unchanged. |
| `listActivityLog` | GET `/admin/activity-log` | query `{ limit, offset, organizationId?, targetType?, targetId?, action?, actorId? }` | `{ entries, total, limit, offset }` where new rows include nullable `summary` and structured `details` beside `before`, `after`, and `metadata` | Returns the plugin envelope unchanged; org reads include `organizationId` and are bounded to that org. UI renders `summary` first and exposes `details` plus raw payload in an expandable JSON viewer. |
| `introspectToken` | POST `/oauth2/introspect` | form body `{ token, token_type_hint?, resource?, client_id? }`; Basic auth when `client_secret` is present | RFC 7662 JSON | Uses `authApiFormPostOrThrow`; sends `client_id` in form only when no Basic secret is supplied. |
| `listClients` | GET `/oauth2/get-clients` | none | `OAuthClient[] \| null` | Normalizes `null` to `[]`; shape is OAuth snake_case, not DB camelCase. |
| `createClient` | POST `/oauth2/create-client` | flat snake_case; `redirect_uris` required and non-empty; omit empty optional arrays; no `public` field | `OAuthClient` with one-time `client_secret` when confidential | Returns the runtime object unchanged. |
| `updateClient` | POST `/oauth2/update-client` | `{ client_id, update }`; arrays optional but non-empty when present; public route does not accept `token_endpoint_auth_method` | `OAuthClient` without `client_secret` | Returns the runtime object unchanged. |
| `rotateClientSecret` | POST `/oauth2/client/rotate-secret` | `{ client_id }` | `OAuthClient` with one-time `client_secret` | Types the value needed by UI as `{ client_secret }`; extra returned fields are ignored. |
| `deleteClient` | POST `/oauth2/delete-client` | `{ client_id }` | empty success body | Resolves `void`; `authApiPostOrThrow` accepts empty success bodies. |
| `listResourceServers` | GET `/admin/resource-servers` | none | `{ resourceServers }` | Unwraps to `ResourceServer[]`. |
| `createResourceServer` | POST `/admin/resource-servers` | flat `{ name, slug, audience, description?, organizationId? }` | `ResourceServer` | Returns the plugin entity unchanged. |
| `updateResourceServer` | PATCH `/admin/resource-servers/:id` | flat `{ slug?, name?, audience?, description? }` | `ResourceServer` | Returns the plugin entity unchanged. |
| `disableResourceServer` | POST `/admin/resource-servers/:id/disable` | `{}` | `ResourceServer` | Returns the plugin entity unchanged. |
| `enableResourceServer` | POST `/admin/resource-servers/:id/enable` | `{}` | `ResourceServer` | Returns the plugin entity unchanged. |
| `deleteResourceServer` | DELETE `/admin/resource-servers/:id` | no body | `{ deleted: true }` | Resolves `void`. |
| `listScopes` | GET `/admin/oauth-scopes` | none | `{ oauthScopes }` | Unwraps to `OAuthResourceScope[]`. |
| `createScope` | POST `/admin/oauth-scopes` | flat `{ resourceServerId, scope, description? }` | `OAuthResourceScope` | Returns the plugin entity unchanged. |
| `updateScope` | PATCH `/admin/oauth-scopes/:id` | flat `{ scope?, description?, enabled? }` | `OAuthResourceScope` | Returns the plugin entity unchanged. |
| `listBindings` | GET `/admin/oauth-client-resource-scopes` | none | `{ oauthClientResourceScopes }` | Unwraps to `ClientResourceScope[]`. |
| `createBinding` | POST `/admin/oauth-client-resource-scopes` | flat `{ clientId, resourceServerId, allowedScopes }` | `ClientResourceScope` | Returns the plugin entity unchanged. |
| `updateBinding` | PATCH `/admin/oauth-client-resource-scopes/:id` | flat `{ allowedScopes?, enabled? }` | `ClientResourceScope` | Returns the plugin entity unchanged. |
| `deleteBinding` | DELETE `/admin/oauth-client-resource-scopes/:id` | no body | `{ deleted: true }` | Resolves `void`. |
| `listOrganizations` | GET `/organization/list` | none | `Organization[]` with metadata as object/string/null | Normalizes metadata to formatted JSON text or `null`. |
| `createOrganization` | POST `/organization/create` | `{ name, slug, logo?, metadata?: object }` | `Organization` | Parses editor JSON string into an object; normalizes returned metadata. |
| `checkSlug` | POST `/organization/check-slug` | `{ slug }` | success or error | Resolves `void`. |
| `getFullOrganization` | GET `/organization/get-full-organization` | query `{ organizationId }` | `Organization \| null` | Passes through `null`; normalizes metadata when present. |
| `updateOrganization` | POST `/organization/update` | `{ organizationId, data: { name?, slug?, logo?, metadata?: object } }` | `Organization` | Parses editor JSON string into an object; normalizes returned metadata. |
| `deleteOrganization` | POST `/organization/delete` | `{ organizationId }` | success body from BA | Resolves `void`. |
| `listMembers` | GET `/organization/list-members` | query `{ organizationId }` | `{ members, total }`; older mocks may be raw array | Unwraps envelope; still accepts the legacy array fixture. |
| `updateMemberRole` | POST `/organization/update-member-role` | `{ memberId, role }` | updated member | Resolves `void`. |
| `removeMember` | POST `/organization/remove-member` | `{ memberIdOrEmail, organizationId }` | `{ member }` | Resolves `void`. |
| `inviteMember` | POST `/organization/invite-member` | `{ email, role, organizationId, resend? }` | invitation | Resolves `void`. |
| `cancelInvitation` | POST `/organization/cancel-invitation` | `{ invitationId }` | canceled invitation | Resolves `void`. |
| `listInvitations` | GET `/organization/list-invitations` | query `{ organizationId }` | `Invitation[]` with BA status spelling | Normalizes `cancelled` to `canceled`; derives `expired` for pending expired invitations. |
| `listTeams` | GET `/organization/list-teams` | query `{ organizationId }` | `Team[]` | Returns the array unchanged. |
| `listTeamMembers` | GET `/organization/list-team-members` | query `{ teamId }` | `TeamMember[]` | Returns the array unchanged. |
| `createTeam` | POST `/organization/create-team` | `{ name, organizationId }` | `Team` | Returns the team unchanged. |
| `updateTeam` | POST `/organization/update-team` | `{ teamId, data: { name, organizationId? } }` | `Team` | Sends route-bound `organizationId` when available so it does not rely on active-org state. |
| `removeTeam` | POST `/organization/remove-team` | `{ teamId, organizationId? }` | success body | Sends route-bound `organizationId` when available; resolves `void`. |
| `addTeamMember` | POST `/organization/add-team-member` | `{ teamId, userId, organizationId }` | team member | Resolves `void`. |
| `removeTeamMember` | POST `/organization/remove-team-member` | `{ teamId, userId, organizationId }` | success body | Resolves `void`. |
| `listUsers` | GET `/admin/list-users` | query `ListUsersParams` | `{ users, total, limit?, offset? }` | Returns the BA envelope; callers pass `limit` and `offset`. |
| `createUser` | POST `/admin/create-user` | `{ name, email, password?, role? }` | `{ user }` | Returns the envelope unchanged. |
| `getUser` | GET `/admin/get-user` | query `{ id }` | raw `User` | Wraps as `{ user }` for UI consistency. |
| `updateUser` | POST `/admin/update-user` | `{ userId, data }` | raw `User` at runtime; OpenAPI may say `{ user }` | Accepts both and returns `{ user }`. |
| `setRole` | POST `/admin/set-role` | `{ userId, role }` | `{ user }` | Returns the envelope unchanged. |
| `setUserPassword` | POST `/admin/set-user-password` | `{ userId, newPassword }` | `{ status: true }` | Returns the status envelope unchanged. |
| `banUser` | POST `/admin/ban-user` | `{ userId, banReason?, banExpiresIn? }` | `{ user }` | Returns the envelope unchanged. |
| `unbanUser` | POST `/admin/unban-user` | `{ userId }` | `{ user }` | Returns the envelope unchanged. |
| `impersonateUser` | POST `/admin/impersonate-user` | `{ userId }` | `{ session, user }` | Returns the envelope unchanged. |
| `stopImpersonating` | POST `/admin/stop-impersonating` | `{}` | `{ session, user }` | Resolves `void`. |
| `removeUser` | POST `/admin/remove-user` | `{ userId }` | `{ success: true }` | Returns the success envelope unchanged. |
| `listUserSessions` | GET `/admin/list-sessions` | query `{ limit, offset, userId }` | `{ sessions, total, limit, offset }` with no `token` field | Pages through the safe `admin-audit` endpoint and returns `{ sessions }` to the component. |
| `revokeUserSession` | POST `/admin/revoke-session` | `{ sessionId }` | `{ success: true }` | Delegates to `revokeAdminSession` and returns `{ success: true }`; no session token crosses the UI boundary. |
| `revokeUserSessions` | POST `/admin/revoke-user-sessions` | `{ userId }` | `{ success: true }` | Returns the success envelope unchanged. |
| `getCurrentSession` | GET `/get-session` | query `{ disableRefresh: "true", disableCookieCache: "true" }` with credentialed no-store request | `{ session, user } \| null` | Catches errors and returns `null`; type includes optional `session` and `user`. |
| `signOut` | POST `/sign-out` | `{}` with credentialed no-store request | Better Auth sign-out response | Resolves `void`. |

## Future Audit Checklist

1. Add or update a screen spec row before adding a new admin route.
2. Read the runtime handler and write the request/response shape in this document before coding the action.
3. Implement the action as the only normalization boundary.
4. Update `_mocks` and stories to reflect the UI-normalized shape.
5. Add a focused contract test covering any raw-vs-envelope, nullable, empty-body, snake-case, or optional-array behavior.
6. Run `pnpm lint`, `pnpm test`, and the UI build gate required by `id-admin-ui`.
