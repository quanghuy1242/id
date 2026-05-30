# Admin UI — Screen Registry

> Every planned `/admin/*` route. `Spec` links to the entry in the spec file. `Status`: `planned` | `specced` | `implemented` | `deferred`.
>
> Create/edit forms that open as modals are not listed as separate routes. Destructive confirmations (delete, ban, revoke) are always modals.

## Table Of Contents

- [Shell chrome (Topbar / Sidebar / MobileDock)](shell.md) — layout.tsx for all `/admin` routes
- [API Gaps](api-gaps.md) — endpoints the admin UI needs but don't exist yet; ordered by priority
- [/admin — Dashboard](#admin--dashboard)
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
| `/admin` | Dashboard — live users/orgs/apps/grants/JWKS stats plus workflow shortcuts | [shell.md](shell.md) | implemented |

---

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
| `/admin/identity/organizations` | Organization list | [identity.md](identity.md#adminidentityorganizations) | specced |
| `/admin/identity/organizations/:orgId` | Org overview — name, slug, logo, metadata, edit, delete | [identity.md](identity.md#adminidentityorganizationsorgid) | specced |
| `/admin/identity/organizations/:orgId/members` | Member list — role assignment, remove member | [identity.md](identity.md#adminidentityorganizationsorgidmembers) | specced |
| `/admin/identity/organizations/:orgId/teams` | Team list — create, rename, delete team; manage team members | [identity.md](identity.md#adminidentityorganizationsorgidteams) | specced |
| `/admin/identity/organizations/:orgId/invitations` | Pending invitations — create, resend, cancel | [identity.md](identity.md#adminidentityorganizationsorgidinvitations) | specced |
| `/admin/identity/organizations/:orgId/audit` | Organization audit timeline backed by `admin-activity-log` | [identity.md](identity.md#adminidentityorganizationsorgidaudit) | implemented |

---

## /admin/oauth — Applications

Actor-scoped. Platform admin sees all clients; org admin sees own org's clients only (org column hidden).

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth` | Legacy redirect to canonical `/admin/oauth/applications` application index | [oauth.md](oauth.md#adminoauth-moved--adminoauthapplications) | implemented |
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
| `/admin/oauth/sessions-tokens` | Legacy redirect to `/admin/security/sessions` after grants IA unification | [oauth.md](oauth.md#adminoauthsessions-tokens-moved--adminsecurity) | implemented |

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
