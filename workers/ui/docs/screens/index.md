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
| `/admin/oauth/applications` | OAuth client list — name, type, org, status, expand for detail, edit, rotate secret, delete | [oauth.md](oauth.md#adminoauthapplications) | implemented |

Note: Detail actions (redirect URIs, scopes, secrets) are inline modals on the list page rather than separate detail routes, following the pattern established by the OAuth Provider plugin's flat endpoint structure.

---

## /admin/oauth — Resource APIs

Actor-scoped. `resourceServer.organizationId` is nullable — null means platform-owned.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/resource-apis` | Resource server list — name, slug, audience, org, enabled status, create/edit/activate/disable/delete modals | [oauth.md](oauth.md#adminoauthresource-apis) | implemented |

Note: Edit and disable actions are handled via inline modals on the list page. No separate detail route needed since the resource-server schema has few fields.

---

## /admin/oauth — Scope Catalog

Cross-cutting read surface. Shows all `oauthResourceScope` rows across all resource servers. CRUD via modals on the list page.

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/scope-catalog` | All scopes across all resource servers — filterable by RS, scope, enabled status; create/edit/disable via modals | [oauth.md](oauth.md#adminoauthscope-catalog) | implemented |

Note: Scope delete is not yet available in the API. Disable toggle via PATCH is available.

---

## /admin/oauth — Other

| Route | Page | Spec | Status |
|---|---|---|---|
| `/admin/oauth/m2m-bindings` | Grid of all `oauthClientResourceScope` rows — client × resource server × allowed scopes × enabled; create/edit/delete modals | [oauth.md](oauth.md#adminoauthm2m-bindings) | implemented |
| `/admin/oauth/sessions-tokens` | Active browser sessions and OAuth tokens — live, paginated (tabs, per-session revoke, token prefixes only) via the `admin-audit` plugin | [oauth.md](oauth.md#adminoauthsessions-tokens) | implemented |

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
| `/admin/security/jwks` | JWKS key list — enriched via `admin-audit` `GET /admin/jwks` (kid, alg, created/expires, active/rotated/expired status, public JWK, copy); private key never exposed | [security.md](security.md#adminsecurityjwks) | implemented |
| `/admin/security/consents` | Global consent audit — live, paginated, filter by client, per-grant revoke via the `admin-audit` plugin | [security.md](security.md#adminsecurityconsents) | implemented |
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
