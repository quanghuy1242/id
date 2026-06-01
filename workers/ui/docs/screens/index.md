# Admin UI — Screen Registry

> Every planned `/admin/*` route. `Spec` links to the entry in the spec file. `Status`: `planned` | `specced` | `implemented` | `deferred`.
>
> Create/edit forms that open as modals are not listed as separate routes. Destructive confirmations (delete, ban, revoke) are always modals.

## Table Of Contents

- [Shell chrome (Topbar / Sidebar / MobileDock)](shell.md) — layout.tsx for all `/admin` routes
- [Auth flow](auth-flow.md) — hosted `/login`, `/consent`, `/select-authorization-context`, `/forgot-password`, `/reset-password`, `/verify-email` (centered panels, not the admin shell)
- [Account Center](account.md) — self-service `/account/*` shell (docs/029); distinct from the operator Console
- [API Gaps](api-gaps.md) — endpoints the admin UI needs but don't exist yet; ordered by priority
- [Admin Action Contracts](action-contracts.md) — `_actions` request/response contracts and future audit checklist
- [Access](access.md) — service-account Access lenses and the deferred Admins & Roles placeholder
- [/admin — Dashboard](#admin--dashboard)
- [/admin/platform — Platform Lens](#adminplatform--platform-lens)
- [/admin/orgs/:orgId — Organization Lens](#adminorgsorgid--organization-lens)
- [/admin/identity — Users](#adminidentity--users)
- [/admin/identity — Organizations](#adminidentity--organizations)
- [/admin/oauth — Applications](#adminoauth--applications)
- [/admin/oauth — Resource APIs](#adminoauth--resource-apis)
- [/admin/oauth — Scope Catalog](#adminoauth--scope-catalog)
- [/admin/oauth — Other](#adminoauth--other)
- [/admin/events](#adminevents)
- [/admin/security](#adminsecurity)
- [/admin/system](#adminsystem)

---

## /admin — Dashboard

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin` | Scope entry — redirects to `/admin/platform`, `/admin/orgs/:orgId`, or `/account` from `console-scopes.defaultScopeId` | [shell.md](shell.md) | implemented |

---

## /admin/platform — Platform Lens

Canonical platform console route prefix. The shell renders the platform scope selector entry, platform-visible nav sections, and platform-owned/global data surfaces.

The planned `/admin/platform/system/**` rows are registry placeholders only; the shell does not link them until the corresponding specs and route files exist.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/platform` | Platform dashboard — live users/orgs/apps/grants/JWKS stats plus workflow shortcuts | [shell.md](shell.md) | implemented |
| `/admin/platform/identity/users` | User list — search by name/email, sort, filter by role/ban status | [identity.md](identity.md#adminidentityusers) | implemented |
| `/admin/platform/identity/users/:userId[/sessions|/audit]` | User detail tabs — overview, sessions, audit | [identity.md](identity.md#adminidentityusersuserid) | implemented |
| `/admin/platform/identity/organizations` | Organization list | [identity.md](identity.md#adminplatformidentityorganizations) | implemented |
| `/admin/platform/identity/organizations/:orgId[/members|/teams|/invitations|/audit]` | Platform organization detail tabs — overview, members, teams, invitations, audit | [identity.md](identity.md#adminplatformidentityorganizationsorgid) | implemented |
| `/admin/platform/oauth/applications` | OAuth client-facing application list | [oauth.md](oauth.md#adminoauthapplications) | implemented |
| `/admin/platform/oauth/applications/:clientId[/...]` | OAuth application detail tabs — overview, credentials, URIs, scopes/grants, connections, quickstart, audit | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |
| `/admin/platform/access/admins-roles` | Derived admins and roles view — platform admins plus org owner/admin memberships; role management deferred | [access.md](access.md#adminplatformaccessadmins-roles) | implemented |
| `/admin/platform/access/service-accounts` | Service accounts — system and tenant M2M clients grouped by tier | [access.md](access.md#adminplatformaccessservice-accounts) | implemented |
| `/admin/platform/access/service-accounts/new` | Service-account creation wizard — fixed M2M OAuth client flow with app-only choices hidden | [access.md](access.md#adminplatformaccessservice-accountsnew) | implemented |
| `/admin/platform/access/resource-apis` | Resource server list — all platform and tenant audiences | [oauth.md](oauth.md#adminoauthresource-apis) | implemented |
| `/admin/platform/access/resource-apis/:resourceServerId[/audit]` | Resource API detail tabs — overview and audit | [oauth.md](oauth.md#adminoauthresource-apisresourceserverid) | implemented |
| `/admin/platform/access/scope-catalog` | Scope catalog — all resource-server scopes with System/Tenant tier badges | [oauth.md](oauth.md#adminoauthscope-catalog) | implemented |
| `/admin/platform/access/m2m-bindings` | M2M bindings — all client-resource-scope grants | [oauth.md](oauth.md#adminoauthm2m-bindings) | implemented |
| `/admin/platform/access/m2m-bindings/:bindingId[/audit]` | M2M binding detail tabs — overview and audit | [oauth.md](oauth.md#adminoauthm2m-bindingsbindingid) | implemented |
| `/admin/platform/security/sessions` | Active browser sessions — stats, live page, per-session revoke | [security.md](security.md#adminsecuritysessions) | implemented |
| `/admin/platform/security/tokens?type=access` | Access token audit — prefixes only, no token bodies | [security.md](security.md#adminsecuritytokens) | implemented |
| `/admin/platform/security/tokens?type=refresh` | Refresh token audit — prefixes only, no token bodies | [security.md](security.md#adminsecuritytokens) | implemented |
| `/admin/platform/security/consents` | Global consent audit — paginated and revoke by grant | [security.md](security.md#adminsecurityconsents) | implemented |
| `/admin/platform/security/introspect` | Token decoder and RFC 7662 introspection console | [security.md](security.md#adminsecurityintrospect) | implemented |
| `/admin/platform/security/jwks` | JWKS key list — issuer signing keys | [security.md](security.md#adminsecurityjwks) | implemented |
| `/admin/platform/security/jwks/:kid[/...]` | JWKS key detail tabs — overview, public JWK, metrics, audit | [security.md](security.md#adminsecurityjwkskid) | implemented |
| `/admin/platform/system/issuer-metadata` | RFC 8414 + OIDC discovery preview | — | planned |
| `/admin/platform/system/scim-status` | SCIM ServiceProviderConfig, ResourceTypes, Schemas health | — | planned |
| `/admin/platform/system/health` | D1 connectivity, KV status, queue depth | — | planned |
| `/admin/platform/system/settings` | Token lifetimes, JWKS rotation interval, bootstrap config | — | planned |

---

## /admin/orgs/:orgId — Organization Lens

Canonical organization console route prefix. The shell renders the selected organization scope, org-visible nav sections, and org-scoped data. Platform-only global users, global keys, system settings, sessions, and token audit do not render in this lens.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/orgs/:orgId` | Organization overview dashboard | [identity.md](identity.md#adminplatformidentityorganizationsorgid) | implemented |
| `/admin/orgs/:orgId/identity/members` | Member list — role assignment, remove member | [identity.md](identity.md#adminplatformidentityorganizationsorgidmembers) | implemented |
| `/admin/orgs/:orgId/identity/teams` | Team list — create, rename, delete team; manage team members | [identity.md](identity.md#adminplatformidentityorganizationsorgidteams) | implemented |
| `/admin/orgs/:orgId/identity/invitations` | Pending invitations — create, resend, cancel | [identity.md](identity.md#adminplatformidentityorganizationsorgidinvitations) | implemented |
| `/admin/orgs/:orgId/oauth/applications` | Org-owned OAuth client-facing applications (`reference_id == orgId`) | [oauth.md](oauth.md#adminoauthapplications) | implemented |
| `/admin/orgs/:orgId/oauth/applications/:clientId[/...]` | Org-owned OAuth application detail tabs | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |
| `/admin/orgs/:orgId/access/service-accounts` | Tenant service accounts (`client_credentials`, `reference_id == orgId`) | [access.md](access.md#adminorgsorgidaccessservice-accounts) | implemented |
| `/admin/orgs/:orgId/access/service-accounts/new` | Tenant service-account creation wizard — fixed M2M OAuth client flow with app-only choices hidden | [access.md](access.md#adminorgsorgidaccessservice-accountsnew) | implemented |
| `/admin/orgs/:orgId/access/resource-apis` | Org-owned resource APIs (`organizationId == orgId`) | [oauth.md](oauth.md#adminoauthresource-apis) | implemented |
| `/admin/orgs/:orgId/access/resource-apis/:resourceServerId[/audit]` | Org-owned Resource API detail tabs | [oauth.md](oauth.md#adminoauthresource-apisresourceserverid) | implemented |
| `/admin/orgs/:orgId/access/scope-catalog` | Scopes for org-owned resource APIs | [oauth.md](oauth.md#adminoauthscope-catalog) | implemented |
| `/admin/orgs/:orgId/access/m2m-bindings` | Org-owned M2M bindings where client and resource server both belong to the org | [oauth.md](oauth.md#adminoauthm2m-bindings) | implemented |
| `/admin/orgs/:orgId/access/m2m-bindings/:bindingId[/audit]` | Org-owned M2M binding detail tabs | [oauth.md](oauth.md#adminoauthm2m-bindingsbindingid) | implemented |
| `/admin/orgs/:orgId/audit` | Organization-scoped audit timeline | [identity.md](identity.md#adminplatformidentityorganizationsorgidaudit) | implemented |

---

The route families below are legacy documentation rows retained for lookup only. Runtime routing is canonical: the proxy redirects `/admin/identity/**`, `/admin/oauth/**`, and `/admin/security/**` to `/admin/platform/**` or `/admin/orgs/:orgId/**`, and the old route files have been removed. New specs, stories, and links must use the platform/org sections above.

## /admin/identity — Users

Actor-scoped. Platform admin sees all users; org admin has no access to this section.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/identity/users` | User list — search by name/email, sort, filter by role/ban status | [identity.md](identity.md#adminidentityusers) | specced |
| `/admin/identity/users/:userId` | User detail — profile, ban/unban, set role, reset password, delete, impersonate | [identity.md](identity.md#adminidentityusersuserid) | specced |
| `/admin/identity/users/:userId/sessions` | User sessions — active sessions, per-session revoke, revoke all | [identity.md](identity.md#adminidentityusersuseridssessions) | specced |
| `/admin/identity/users/:userId/audit` | User audit timeline backed by `admin-activity-log` | [identity.md](identity.md#adminidentityusersuseridaudit) | implemented |

---

## /admin/identity — Organizations

Platform admin: full list + manage any org. Org admin: own org detail only (direct link, no list).

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/identity/organizations` | Organization list | [identity.md](identity.md#adminplatformidentityorganizations) | specced |
| `/admin/identity/organizations/:orgId` | Org overview — name, slug, logo, metadata, edit, delete | [identity.md](identity.md#adminplatformidentityorganizationsorgid) | specced |
| `/admin/identity/organizations/:orgId/members` | Member list — role assignment, remove member | [identity.md](identity.md#adminplatformidentityorganizationsorgidmembers) | specced |
| `/admin/identity/organizations/:orgId/teams` | Team list — create, rename, delete team; manage team members | [identity.md](identity.md#adminplatformidentityorganizationsorgidteams) | specced |
| `/admin/identity/organizations/:orgId/invitations` | Pending invitations — create, resend, cancel | [identity.md](identity.md#adminplatformidentityorganizationsorgidinvitations) | specced |
| `/admin/identity/organizations/:orgId/audit` | Organization audit timeline backed by `admin-activity-log` | [identity.md](identity.md#adminplatformidentityorganizationsorgidaudit) | implemented |

---

## /admin/oauth — Applications

Actor-scoped. Platform admin sees all clients; org admin sees own org's clients only (org column hidden).

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth` | Legacy redirect to canonical `/admin/platform/oauth/applications` application index | [oauth.md](oauth.md#adminoauth-moved--adminoauthapplications) | implemented |
| `/admin/oauth/applications` | OAuth client list — stats, type badges, row navigation, create wizard entry | [oauth.md](oauth.md#adminoauthapplications) | implemented |
| `/admin/oauth/applications/new` | OAuth client creation wizard — type, basics, URIs, scopes, review, one-time secret reveal | [oauth.md](oauth.md#adminoauthapplicationsnew) | implemented |
| `/admin/oauth/applications/:clientId` | OAuth client detail — overview, credentials, URIs, scopes/grants, connections, quickstart, audit | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |
| `/admin/oauth/applications/:clientId/credentials` | OAuth client detail tab — credentials | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |
| `/admin/oauth/applications/:clientId/uris` | OAuth client detail tab — redirect and post-logout URIs | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |
| `/admin/oauth/applications/:clientId/scopes` | OAuth client detail tab — scopes and grants | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |
| `/admin/oauth/applications/:clientId/connections` | OAuth client detail tab — resource API connections | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |
| `/admin/oauth/applications/:clientId/quickstart` | OAuth client detail tab — integration quickstart | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |
| `/admin/oauth/applications/:clientId/audit` | OAuth client detail tab — activity timeline | [oauth.md](oauth.md#adminoauthapplicationsclientid) | implemented |

Note: Detail actions moved to a route-backed detail surface per docs/027; destructive and one-shot secret actions still use guarded dialogs.

---

## /admin/oauth — Resource APIs

Actor-scoped. `resourceServer.organizationId` is nullable — null means platform-owned.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/resource-apis` | Resource server list — stats, updated/by columns, row navigation, create/edit/activate/disable/delete modals | [oauth.md](oauth.md#adminoauthresource-apis) | implemented |
| `/admin/oauth/resource-apis/:resourceServerId` | Resource server detail — overview and audit | [oauth.md](oauth.md#adminoauthresource-apisresourceserverid) | implemented |

Note: Edit and disable actions stay inline on the list page; overview and audit are deep-linkable.

---

## /admin/oauth — Scope Catalog

Cross-cutting read surface. Shows all `oauthResourceScope` rows across all resource servers. CRUD via modals on the list page.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/scope-catalog` | All scopes across all resource servers — stats, ScopeBuilder filtering, CSV bulk import, create/edit/disable via modals | [oauth.md](oauth.md#adminoauthscope-catalog) | implemented |

Note: Scope delete is not yet available in the API. Disable toggle via PATCH is available.

---

## /admin/oauth — Other

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/m2m-bindings` | Grid of all `oauthClientResourceScope` rows — stats, client × resource server × allowed scopes × enabled, created/updated by, create/edit/delete modals | [oauth.md](oauth.md#adminoauthm2m-bindings) | implemented |
| `/admin/oauth/m2m-bindings/:bindingId` | M2M binding detail — overview and audit | [oauth.md](oauth.md#adminoauthm2m-bindingsbindingid) | implemented |
| `/admin/oauth/sessions-tokens` | Legacy redirect to `/admin/platform/security/sessions` after grants IA unification | [oauth.md](oauth.md#adminoauthsessions-tokens-moved--adminsecurity) | implemented |

---

## /admin/events

Track B (SET/SSF async push) is **deferred** — docs 014/015/016 unimplemented. Do not spec or implement until Track B begins.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/events/streams` | SSF subscription list | — | deferred |
| `/admin/events/streams/:streamId` | Stream overview — endpoint, auth method, event types | — | deferred |
| `/admin/events/streams/:streamId/configuration` | Delivery config — HMAC, retry policy | — | deferred |
| `/admin/events/streams/:streamId/delivery-log` | Delivery timeline — success/failure/dead-letter | — | deferred |
| `/admin/events/streams/:streamId/verify` | Send test verification event | — | deferred |
| `/admin/events/catalog` | SET event type catalog — schemas, sample payloads | — | deferred |
| `/admin/events/audit-log` | Reconciliation findings, mismatched clients | — | deferred |
| `/admin/events/metrics` | Delivery rates, latency p50/p95/p99, DLQ depth | — | deferred |

---

## /admin/security

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/security/sessions` | Active browser sessions — stats, live page, per-session revoke | [security.md](security.md#adminsecuritysessions) | implemented |
| `/admin/security/tokens?type=access` | Access token audit — prefixes only, no token bodies | [security.md](security.md#adminsecuritytokens) | implemented |
| `/admin/security/tokens?type=refresh` | Refresh token audit — prefixes only, no token bodies | [security.md](security.md#adminsecuritytokens) | implemented |
| `/admin/security/jwks` | JWKS key list — stats, table, emergency rotate, public JWK only; private key never exposed | [security.md](security.md#adminsecurityjwks) | implemented |
| `/admin/security/jwks/:kid` | JWKS key detail — overview, public JWK, metrics stub, audit | [security.md](security.md#adminsecurityjwkskid) | implemented |
| `/admin/security/consents` | Global consent audit — live, paginated, filter by client, per-grant revoke via the `admin-audit` plugin | [security.md](security.md#adminsecurityconsents) | implemented |
| `/admin/security/introspect` | Token decoder and RFC 7662 introspection console | [security.md](security.md#adminsecurityintrospect) | implemented |
| `/admin/security/policies` | CEL policy list — create, test expression console | — | deferred |

`/admin/security/policies` deferred pending `idCelPolicy` plugin (docs/003 §2).

---

## /admin/system

Platform admin only.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/system/service-accounts` | Infra M2M clients (`referenceId=NULL`) — provision, rotate, revoke | — | planned |
| `/admin/system/issuer-metadata` | RFC 8414 + OIDC discovery preview | — | planned |
| `/admin/system/scim-status` | SCIM ServiceProviderConfig, ResourceTypes, Schemas health | — | planned |
| `/admin/system/health` | D1 connectivity, KV status, queue depth | — | planned |
| `/admin/system/settings` | Token lifetimes, JWKS rotation interval, bootstrap config | — | planned |
