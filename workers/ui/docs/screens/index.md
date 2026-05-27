# Admin UI — Screen Registry

> Every planned `/admin/*` route. `Spec` links to the entry in the spec file. `Status`: `planned` | `specced` | `implemented` | `deferred`.
>
> Create/edit forms that open as modals are not listed as separate routes. Destructive confirmations (delete, ban, revoke) are always modals.

## Table Of Contents

- [Shell chrome (Topbar / Sidebar / MobileDock)](shell.md) — layout.tsx for all `/admin` routes
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
| `/admin` | Dashboard — token volume, active sessions, client/org counts | — | planned |

---

## /admin/identity — Users

Actor-scoped. Platform admin sees all users; org admin has no access to this section.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/identity/users` | User list — search by name/email, sort, filter by role/ban status | [identity.md](identity.md#adminidentityusers) | specced |
| `/admin/identity/users/:userId` | User detail — profile, ban/unban, set role, reset password, delete, impersonate | [identity.md](identity.md#adminidentityusersuserid) | specced |
| `/admin/identity/users/:userId/sessions` | User sessions — active sessions, per-session revoke, revoke all | [identity.md](identity.md#adminidentityusersuseridssessions) | specced |

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

---

## /admin/oauth — Applications

Actor-scoped. Platform admin sees all clients; org admin sees own org's clients only (org column hidden).

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/applications` | OAuth client list — name, type, org, status | — | planned |
| `/admin/oauth/applications/:clientId` | Client overview — name, type, org, grant types, enabled status | — | planned |
| `/admin/oauth/applications/:clientId/redirect-uris` | Redirect URI management — add, remove | — | planned |
| `/admin/oauth/applications/:clientId/scopes` | Scope grants — `oauthClientResourceScope` builder: pick resource server → pick allowed scope subset | — | planned |
| `/admin/oauth/applications/:clientId/secrets` | Secret management — rotate, view created-at | — | planned |
| `/admin/oauth/applications/:clientId/consents` | Consent audit — user × scopes × timestamp, revoke | — | planned |

---

## /admin/oauth — Resource APIs

Actor-scoped. `resourceServer.organizationId` is nullable — null means platform-owned.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/resource-apis` | Resource server list — audience, org, enabled status | — | planned |
| `/admin/oauth/resource-apis/:rsId` | Resource server overview — audience, org, edit, disable | — | planned |
| `/admin/oauth/resource-apis/:rsId/scopes` | Scope catalog for this RS — declare `oauthResourceScope` rows, enable/disable | — | planned |

---

## /admin/oauth — Scope Catalog

Cross-cutting read surface. Shows all `oauthResourceScope` rows across all resource servers. CRUD still lives on individual RS and client detail pages above.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/scope-catalog` | All scopes across all resource servers — filterable by RS, shows enabled status and client binding count | — | planned |

---

## /admin/oauth — Other

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/m2m-bindings` | Grid of all `oauthClientResourceScope` rows — client × resource server × allowed scopes × enabled | — | planned |
| `/admin/oauth/sessions-tokens` | Active OAuth sessions, token revocation, introspection test console | — | planned |

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
| `/admin/security/jwks` | Keyset list — expiry dates, rotation trigger | — | planned |
| `/admin/security/consents` | Global consent audit — user × client × scopes × timestamp, revoke | — | planned |
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
