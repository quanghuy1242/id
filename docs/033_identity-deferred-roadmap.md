# Identity Deferred Roadmap

> Status: roadmap
>
> Date: 2026-06-05
>
> Scope: deferred and re-evaluation items from the identity program around `docs/028` through `docs/032`.
>
> Source docs: `docs/028_tenant-scoped-platform-experience.md`, `docs/029_account-center-and-self-service-identity.md`, `docs/030_client-initiated-registration-and-onboarding.md`, `docs/031_platform-access-control.md`, `docs/032_identity-program-build-backlog.md`.
>
> Related docs: `docs/005_oauth2-oidc-integration-guide.md`, `docs/007_cloudflare-deployment-runbooks.md`, `workers/ui/docs/screens/access.md`, `workers/ui/docs/screens/identity.md`, `workers/ui/docs/screens/index.md`.

## Table Of Contents

- [1. Purpose](#1-purpose)
- [2. Ownership Model](#2-ownership-model)
- [3. Workstreams](#3-workstreams)
  - [3.1 Access Policy And Admin IAM](#31-access-policy-and-admin-iam)
  - [3.2 Registration Reliability And Protocol Growth](#32-registration-reliability-and-protocol-growth)
  - [3.3 Org-Scoped Security Observability](#33-org-scoped-security-observability)
  - [3.4 Account Self-Service Boundaries](#34-account-self-service-boundaries)
  - [3.5 Identity Events And User-Visible History](#35-identity-events-and-user-visible-history)
- [4. Sequencing](#4-sequencing)
- [5. Decisions To Record Before Build](#5-decisions-to-record-before-build)
- [6. Guardrails](#6-guardrails)
- [7. Traceability](#7-traceability)
- [8. Definition Of Done](#8-definition-of-done)

## 1. Purpose

This document holds the deferred identity-program items that are not part of the active execution tracker in `docs/032`. It is a roadmap, not a task board: each workstream names the contract that must be decided before build — route ownership, authority model, standards boundary, bounded read model, or event shape — and the sequencing section gives a default order.

A deferred item becomes plannable here once its missing contract is named. Until then it stays parked under the workstream that owns the decision.

## 2. Ownership Model

The roadmap keeps Identity and Access responsibilities separate and constrains where Security and Account may grow.

| Domain | Owns | Boundary |
|---|---|---|
| Identity | People, organizations, memberships, teams, invitations, user-facing account state | Record and membership surfaces only |
| Access | Policies, principals, permissions, service accounts, scopes, bindings, delegated admin authority, admission controls | Decides who may enter or gain default grants |
| Security | Token, session, key, and consent visibility | Only when the read model is bounded and authorization is provable without broad user scans |
| Account | Current-user self-service | Never exposes admin audit internals |
| Events | Informational and reliability signals | Never a synchronous authorization gate for registration, account updates, or token issuance |

## 3. Workstreams

Each workstream uses the same shape: **Objective**, **Current state**, **Direction**, **Decision gate** (the contract to settle before build), and **Depends on**.

### 3.1 Access Policy And Admin IAM

**Objective:** Place registration policy where it belongs in the console IA and build delegated-admin management on a real authority model.

**Current state:** `workers/ui/docs/screens/identity.md` places registration policies under Identity. The policy also controls client eligibility, default org membership, quota, and invite/domain rules, which makes it an admission surface, not a pure Identity record. `/admin/platform/access/admins-roles` exists today as a read-only derived view of platform admins plus organization owner/admin memberships.

**Direction:** Move the registration policy UI conceptually under Access — candidate routes `/admin/platform/access/registration-policies` and `/admin/orgs/:orgId/access/registration-policies` — and keep the existing Identity routes as redirects during migration. The API stays `POST/GET /api/auth/admin/registration-policies*`; this is a console IA correction, not a protocol change. Build Admins & Roles write management only through the delegated administration model from `docs/028` §8.10: `idAdminDelegation`, `adminRole` (permission sets from `ConsolePermission`), and `adminRoleBinding` (binds user/team/group or explicitly approved OAuth clients to typed scopes such as `platform`, `organization:org_123`, or a finer resource scope), projecting into `ConsoleScope.permissions`.

**Decision gate:** Whether Access owns all policy-like admin screens, including registration policies, and what minimum delegated-admin use case unlocks role/binding management.

**Depends on:** `idAdminDelegation` schema/runtime before any write controls on Admins & Roles.

### 3.2 Registration Reliability And Protocol Growth

**Objective:** Grow registration past the first-release model only when a specific need — correctness, protocol integrity, or operator workflow — is identified.

**Current state:** First release uses `prompt=create`, policy-gated signup, and soft quota.

**Direction:** Keep the first-release base. Add capabilities discretely rather than as a generic "registration v2":

- **Strict atomic quota** — when quota correctness must survive concurrent signup bursts without soft-reservation overrun. Needs a plugin-owned D1 concurrency contract and tests proving simultaneous registrations cannot exceed policy limits.
- **PAR** — when registration requests become too large or sensitive for browser redirects.
- **RAR** — only when flat OAuth scopes cannot express the authorization request without unsafe custom JSON.
- **Admin approval / waitlist / analytics / abuse dashboards** — when the product needs an operator workflow beyond allow/deny policy.
- **Dynamic client registration changes** — require a separate client-management contract.

**Decision gate:** Whether the next registration need is correctness, protocol integrity, or operator workflow. Each produces a different design.

**Depends on:** None for strict quota beyond architecture approval; protocol items are independent.

### 3.3 Org-Scoped Security Observability

**Objective:** Extend org-scoped visibility into sessions/tokens and joined-field search only on a bounded read model.

**Current state:** Org-scoped consents are implemented for the bounded case only: the read resolves org-owned OAuth clients first, then reads/revokes matching consent rows. Org sessions/tokens and joined-field search are not built.

**Direction:** Do not build org sessions/tokens by scanning all users or all tokens for an org admin. The next acceptable design needs a bounded candidate set, denormalized read side, or plugin-supported index that proves an org admin sees only their organization. Joined-field search (for example sessions/tokens/consents by user email) belongs in the same read-model decision, because Better Auth physical tables are not a stable query contract. Until a bounded read model exists, the product state is platform-only sessions/tokens plus bounded org consents.

**Decision gate:** The bounded read model. The UI route follows once it exists.

**Depends on:** A denormalized index or plugin-supported query contract.

### 3.4 Account Self-Service Boundaries

**Objective:** Classify each Account capability against a standard and an owning surface before any UI.

**Current state:** User-managed MFA, verified email change, account deletion, external `return_to`, provider-specific Account metadata, `idUserProfile`, and inbound SCIM are all deferred with triggers recorded in `docs/029` §16.

**Direction:** Treat each item as a standards-and-ownership decision before UI:

- **Email change** — Better Auth capability plus OIDC claim timing and verification policy.
- **Account deletion** — lifecycle, retention, event, and downstream consumer handling.
- **External `return_to`** — registered-client validation, not arbitrary URLs.
- **`idUserProfile`** — explicit OIDC/UserInfo/SCIM claim ownership.
- **Inbound SCIM** — provisioning, not browser self-service; not conflated with Account Center.

**Decision gate:** Which Account capability has a concrete consumer, and which standard or Better Auth capability owns the contract.

**Depends on:** Per-item standards classification.

### 3.5 Identity Events And User-Visible History

**Objective:** Introduce identity events when there is a specific visible-history or downstream-reliability need, not as a catch-all logging project.

**Current state:** Registration lifecycle events, account security-event feed, and `/admin/events/*` surfaces are deferred (`docs/032` H1/H2). Connects to SET/SSF/RISC/CAEP docs.

**Direction:** Define event payloads before adding UI history. Registration `started` / `denied` / `completed` / `quota-full` / `invite-accepted` are repository-specific candidates. Account security history must be current-user-only and privacy-filtered. Admin event-stream screens (catalog, delivery log, verification, audit log, metrics) wait until the identity-event producer exists with stream configuration, SET signing, retry/DLQ, and retention behavior. Events stay informational unless a separate enforcement design says otherwise.

**Decision gate:** Whether events are needed for operator diagnostics, user history, downstream reconciliation, or enforcement. Each is a separate outcome.

**Depends on:** The identity-event producer for any admin stream surface.

## 4. Sequencing

Default order. Each step's gate must be settled before its build.

1. **Settle Access IA** — decide whether registration policies move under Access; update the route/spec contract with redirects from existing Identity paths. (Workstream 3.1)
2. **Define Admin IAM** — write the delegated-admin product contract: minimum roles, bindable principals, scopes, audit details, and how `ConsolePermission` changes. (Workstream 3.1)
3. **Pick the next registration maturity target** — strict quota, PAR/RAR, approval/waitlist, or analytics. (Workstream 3.2)
4. **Define the org security read model** — before expanding org sessions/tokens or joined-field search. (Workstream 3.3)
5. **Pick one Account capability** — only after its standards boundary and owner surface are clear. (Workstream 3.4)
6. **Start identity events** — when a specific visible-history or downstream-reliability need exists. (Workstream 3.5)

## 5. Decisions To Record Before Build

- **Access IA** — Access owns admission and IAM policy surfaces; Identity owns people and memberships. If accepted, registration policy screens move under Access and Identity routes become compatibility redirects.
- **Delegated admin** — partial admin authority is roles-on-scope through `idAdminDelegation`, not hard-coded UI conditionals.
- **Registration quota** — soft quota stays acceptable until product or abuse pressure requires strict atomic enforcement.
- **Org security** — org-scoped sessions/tokens require a bounded read model before UI.
- **Account Center** — self-service capabilities are classified as protocol standard, Better Auth-supported, repo extension, or out of scope before implementation.
- **Events** — registration/account events are informational unless a separate enforcement design says otherwise.

## 6. Guardrails

- Existing bookmarks to `/admin/platform/identity/registration-policies` and `/admin/orgs/:orgId/identity/registration-policies` keep working during any route move.
- Organization owner/admin membership is not silently reinterpreted as a delegated role until `idAdminDelegation` exists and migration semantics are documented.
- Registration policies may grant default organization membership, but clients never assert trusted roles, teams, or scopes outside server policy.
- Org admins do not gain visibility into global sessions, global token inventories, or other organizations through search convenience.
- Account deletion and email change can affect OIDC claims, SCIM projections, events, and downstream resource servers; the visible Account UI appears only after those effects are specified.
- Identity events do not leak denial reasons, invite details, or admin-only audit context to users or external subscribers.

## 7. Traceability

Maps each source item from the `docs/032` deferred/re-evaluation table to its workstream. Shipped items are listed for history only and are not active roadmap work.

### Active

| Source item | Prior position | Workstream | Retained detail |
|---|---|---|---|
| Registration policy admin console | Pulled forward as D5, L | 3.1 Access Policy And Admin IAM | Console exists; route placement is the open decision. The screen controls client admission, invite/domain/quota rules, and default grants. If Access owns policy surfaces, move the UI from Identity to Access with compatibility redirects. |
| Admins & Roles management screen | Deferred, XL | 3.1 Access Policy And Admin IAM | Current screen is read-only derived state. Write controls require the delegated-admin model first: roles, bindable principals, bindable scopes, audit details, and permission projection into `ConsoleScope.permissions`. |
| `idAdminDelegation` plugin | Deferred, XL | 3.1 Access Policy And Admin IAM | Schema/runtime half of Admin IAM. `adminRole` defines permission sets from `ConsolePermission`; `adminRoleBinding` binds user/team/group or approved OAuth clients to typed scopes (`platform`, `organization:org_123`, finer resource scopes). |
| Strict atomic quota | Deferred, L | 3.2 Registration Reliability And Protocol Growth | Soft quota stays the first-release model. Strict quota needs a plugin-owned D1 concurrency contract and tests proving simultaneous registrations cannot exceed policy limits. |
| Registration PAR/RAR, admin approval, waitlist, analytics/abuse dashboards, dynamic client registration | Deferred, M–XL | 3.2 Registration Reliability And Protocol Growth | Separate upgrades. PAR for large/sensitive requests; RAR for structured authorization beyond flat scopes; approval/waitlist/analytics are operator workflows; dynamic client registration needs a separate client-management contract. |
| Org-scoped sessions/tokens | Deferred, XL | 3.3 Org-Scoped Security Observability | Do not scan global session/token tables for org admins. Build only after a bounded read side exists. |
| Joined-field admin search | Deferred from admin-audit | 3.3 Org-Scoped Security Observability | Searching sessions/tokens/consents by user email needs a documented read side or denormalization. Better Auth physical tables are not a stable join contract. |
| Account MFA, email change, deletion, external `return_to`, account metadata discovery, `idUserProfile`, inbound SCIM | Deferred by F2, L–XL | 3.4 Account Self-Service Boundaries | Each capability needs a standards classification and owner surface before UI: Better Auth capability, OIDC/UserInfo claim timing, SCIM projection, registered-client return validation, lifecycle/event handling, privacy filtering, downstream impact. |
| Registration and account identity events | Deferred by H1/H2, M | 3.5 Identity Events And User-Visible History | Registration `started`/`denied`/`completed`/`quota-full`/`invite-accepted` and current-user security events need payloads, privacy filtering, retention, and producer boundaries before UI history or external streams. |
| `/admin/events/*` SET/SSF surfaces | Deferred until identity-event producer | 3.5 Identity Events And User-Visible History | Event stream, catalog, delivery-log, verification, audit-log, and metrics screens wait for the identity-event producer, stream configuration, SET signing, retry/DLQ, and retention model. |

### Shipped (history only)

| Source item | Prior position | Note for future work |
|---|---|---|
| OAuth signup contract proof | Pulled forward as D0a, S | Proof covered `prompt=create`, hosted registration handoff, and `/oauth2/continue` with `created: true`. No further work unless the OAuth registration protocol changes. |
| High-impact action step-up | Pulled forward as E1, M | Platform-entry proof is not the same as short-freshness proof for sensitive writes such as JWKS rotation. Future sensitive writes reuse the action-level model. |
| Scope-aware org audit | Pulled forward as E2, L | Audit model records scope, organization id, actor platform/org authority, and step-up state. Future audit surfaces keep those fields rather than path-only rows. |
| `resolvePlatformAuthority` consolidation | Shipped in G3, S | Human platform/org authority is centralized for the owner/admin model. Delegated admin must extend the authority model deliberately, not fork the old checks. |
| Org-scoped consents | Shipped in E3, M | Accepted pattern is bounded reads: resolve org-owned OAuth clients first, then read/revoke matching consents. Does not by itself justify org sessions/tokens. |

## 8. Definition Of Done

- Deferred items from `docs/032` have one workstream home and are grouped by the decision they require, not by old execution row.
- Access versus Identity ownership is explicit, including the registration policy placement decision.
- Admins & Roles and `idAdminDelegation` are treated as one delegated-admin IAM workstream.
- Each workstream states the contract to settle before build.
- Already-shipped items are separated from active roadmap work.
