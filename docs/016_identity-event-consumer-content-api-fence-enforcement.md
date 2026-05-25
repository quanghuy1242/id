# Identity Event Consumer In `content-api` — Fence Enforcement

> Status: implementation-grade plan, conditional
>
> Date: 2026-05-25
>
> Scope:
>
> - `/home/quanghuy1242/pjs/content-api` — consumer-side enforcement (token denial ahead of expiry)
>
> Source docs:
>
> - [013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md) — D5 (fence enforcement gated on audit insufficiency) and D4 (CAEP gated on M2M decision)
> - [014_identity-event-producer-id.md](014_identity-event-producer-id.md) — producer wire format; CAEP additions in §8 are a prerequisite of Phase 3
> - [015_identity-event-consumer-content-api-audit.md](015_identity-event-consumer-content-api-audit.md) — Phase 1+2 audit infrastructure this builds on
> - `/home/quanghuy1242/pjs/content-api/src/application/auth/authenticate-bearer-token.usecase.ts` — extended in this phase to require verified `iat`
> - `/home/quanghuy1242/pjs/content-api/src/domain/iam/content-policy.ts` — consumer of the fence
>
> Standards references:
>
> - RFC 8417 — Security Event Token (SET)
> - OpenID CAEP Specification 1.0 Final — `event_timestamp` event timing, <https://openid.net/specs/openid-caep-1_0-final.html>
>
> Related docs:
>
> - [015_identity-event-consumer-content-api-audit.md](015_identity-event-consumer-content-api-audit.md)

## Table Of Contents

- [1. Goal And Conditional Status](#1-goal-and-conditional-status)
- [2. Trigger Conditions To Begin This Work](#2-trigger-conditions-to-begin-this-work)
- [3. System Summary](#3-system-summary)
- [4. Current-State Findings](#4-current-state-findings)
- [5. Target Model](#5-target-model)
  - [5.1 What A Fence Is](#51-what-a-fence-is)
  - [5.2 Fence Kinds](#52-fence-kinds)
  - [5.3 New Storage](#53-new-storage)
  - [5.4 `Actor` Contract Change](#54-actor-contract-change)
  - [5.5 Denial Point](#55-denial-point)
  - [5.6 Direct-Share Rule, Re-Stated](#56-direct-share-rule-re-stated)
- [6. Architecture Decisions](#6-architecture-decisions)
  - [6.1 Enforce In Token Principal Expansion, Not In `ContentPolicy.can()` Body](#61-enforce-in-token-principal-expansion-not-in-contentpolicycan-body)
  - [6.2 Require Verified `iat` On All Bearer Tokens](#62-require-verified-iat-on-all-bearer-tokens)
  - [6.3 Fence Updates Run In The Event Handler Transaction](#63-fence-updates-run-in-the-event-handler-transaction)
  - [6.4 Fences Are Monotonic By `tokens_issued_before`](#64-fences-are-monotonic-by-tokens_issued_before)
  - [6.5 Fence Lifetime Is Indefinite Until Re-Enable Or Operator Action](#65-fence-lifetime-is-indefinite-until-re-enable-or-operator-action)
  - [6.6 Parallel `AuthorizationActor` Projection Over Flat `Actor` Rewrite](#66-parallel-authorizationactor-projection-over-flat-actor-rewrite)
- [7. Implementation Strategy](#7-implementation-strategy)
- [8. Detailed Implementation Plan](#8-detailed-implementation-plan)
  - [8.1 Schema And Migration](#81-schema-and-migration)
  - [8.2 Handler Updates To Write Fences](#82-handler-updates-to-write-fences)
  - [8.3 `AuthenticateBearerTokenUseCase` Changes](#83-authenticatebearertokenusecase-changes)
  - [8.4 Token Principal Expansion Updates](#84-token-principal-expansion-updates)
  - [8.5 Fence Repository](#85-fence-repository)
  - [8.6 Operator Override Endpoints](#86-operator-override-endpoints)
  - [8.7 SLA Documentation Updates](#87-sla-documentation-updates)
- [9. Migration And Rollout](#9-migration-and-rollout)
- [10. Edge Cases And Failure Modes](#10-edge-cases-and-failure-modes)
- [11. Test And Verification Plan](#11-test-and-verification-plan)
- [12. Definition Of Done](#12-definition-of-done)
- [13. Final Model](#13-final-model)

## 1. Goal And Conditional Status

Add consumer-side enforcement to `content-api` so that, after a RISC, CAEP, or approved repository-specific identity event commits, in-flight self-contained JWTs that *would otherwise verify locally* are denied at token-acceptance time, ahead of their natural expiry.

**This document is conditional.** Per [013 D5](013_identity-event-standards-and-decisions.md#55-d5--fence-enforcement-is-gated-on-audit-insufficiency), fence enforcement is not first-release work. It is built only when both:

1. Phase 1 + 2 audit (doc 015) has shipped and been observed in production, **and**
2. An operational requirement has been recorded that names a specific scenario where audit visibility is insufficient and in-flight token denial is needed.

If those conditions are not met, do not implement this doc. Doc 015 remains the production state.

When implementation does begin, this doc is the design of record. Cross-reference any spike work back here so the eventual change set is small and reviewed against the conditions in §2.

Outcomes when implemented:

- `content-api` requires a verified `iat` on every accepted JWT.
- A new local fence table records the highest consumer-derived `tokens_issued_before` cutoff per identity key.
- `ContentPolicy.can()` is unchanged; denial happens earlier, in token-principal expansion.
- A clear, documented delivery-bound revocation SLA replaces "immediate revocation" framing.

Non-goals:

- Changes to `id` — Phase 3 is consumer-only. Phase 2 producer work (CAEP and approved extension event emission, doc 014 §8) is a prerequisite.
- Any change to the `account-disabled` / `account-enabled` re-enablement workflow other than via the operator override (§8.6).
- Auto-deleting policy bindings when fences fire.

## 2. Trigger Conditions To Begin This Work

Implementation starts only when:

- [ ] [013 D4](013_identity-event-standards-and-decisions.md#54-d4--caep-adoption-is-gated-on-the-m2m-decision) has been triggered, doc 014 §8 (producer CAEP and extension additions) has shipped, and the producer is emitting repo-specific `organization-member-removed`, `team-member-removed`, `oauth-client-disabled`, `team-deleted`, and `oauth-client-grant-disabled` to `content-api`'s subscription; CAEP `credential-change` is included only when an actual credential is revoked.
- [ ] Doc 015 §8 (consumer CAEP audit) has shipped.
- [ ] A specific operational requirement has been recorded — for example: "service-account credential disable must stop honored tokens within N minutes," or "team-member removal must stop content-write authority within M minutes" — that audit visibility alone does not satisfy.
- [ ] [013](013_identity-event-standards-and-decisions.md) is amended to reflect the new D5 outcome and SLA values.

Until all four are checked, this doc is on paper only.

## 3. System Summary

```text
Before Phase 3                       After Phase 3
──────────────                       ──────────────
JWT verified locally (sig+exp)       JWT verified locally (sig+exp)
                                     + iat verified and carried into Actor

token claims used by                 token claims used by
ContentPolicy.can()                  expand-token-principals
                                       └─ check fences for each derived principal
                                          ─ if iat <= fence.tokens_issued_before
                                          ─ drop that principal from the actor
                                     ContentPolicy.can() runs against the
                                       (possibly reduced) principal set
```

A "fence" is a small local record saying: "for this principal kind + identifier, any token issued at or before `tokens_issued_before` must not be honored as that principal." `tokens_issued_before` is a consumer-side column derived from the state-change timestamp (`event_timestamp` for CAEP, or SET `toe` for RISC/repository-specific events); it is not a CAEP-defined claim. Fences are written by the event handler (in the same transaction as the receipt insert) and read in the bearer-token use case path.

## 4. Current-State Findings

Before this phase, [src/application/auth/authenticate-bearer-token.usecase.ts](../../content-api/src/application/auth/authenticate-bearer-token.usecase.ts):

- Verifies JWT issuer, audience, JWKS signature, scope claims.
- Projects `sub`, `org_id`, `team_ids`, `azp`/`client_id` into `Actor`.
- Does **not** require or carry `iat` in `Actor`. Tokens that happen to omit `iat` (none in current `id` issuance, but allowed by code) pass.

[src/domain/iam/content-policy.ts](../../content-api/src/domain/iam/content-policy.ts):

- Expands the `Actor` into token-principal candidates (user-self, workspace-org, team-derived, service-account).
- Calls `can(actor, action, resource)` against local bindings and denials.

[src/infrastructure/db/schema.ts](../../content-api/src/infrastructure/db/schema.ts) after doc 015:

- Has `identityEventReceipts` and `identityReferenceFindings`.
- Has **no** fence table yet — this doc introduces it.

The `Actor` type currently lives in [src/domain/auth/actor.ts](../../content-api/src/domain/auth/actor.ts) (or equivalent — confirm path during spike).

## 5. Target Model

### 5.1 What A Fence Is

A fence is a `(fence_kind, key, tokens_issued_before)` triple. When the consumer is verifying a token and expanding it into principals, it checks each derived principal against the matching fence. If `token.iat <= fence.tokens_issued_before`, that principal is excluded from `Actor.principals`. The token still verifies for principals that are not fenced — for example, a user fenced from workspace authority for `org_1` may still have a valid direct-share binding for an unrelated resource (§5.6).

```text
token.iat   = T_token
fence.tokens_issued_before = T_fence

if T_token <= T_fence:
   principal excluded
else:
   principal admitted
```

This is the consumer's enforcement policy built from CAEP timing: post-event tokens are admitted because their `iat` is greater than `T_fence`; pre-event tokens are denied for the affected principal until natural expiry would have removed them anyway. CAEP standardizes the event, not this local fence table.

### 5.2 Fence Kinds

| Fence kind | Key | Triggered by event |
|---|---|---|
| `user-disabled` | `user_id` | RISC `account-disabled` |
| `user-purged` | `user_id` | RISC `account-purged` (permanent) |
| `workspace` | `org_id`, `user_id` | repo-specific `organization-member-removed` |
| `team` | `org_id`, `team_id`, `user_id` | repo-specific `team-member-removed` |
| `team-deleted` | `org_id`, `team_id` | repo-specific `team-deleted` |
| `service-account-disabled` | `client_id` | repo-specific `oauth-client-disabled`, or CAEP `credential-change` only for an actual credential revocation with `change_type: revoke` |
| `service-account-grant` | `client_id`, `org_id`, `resource` | repo-specific `oauth-client-grant-disabled` |

`user-purged` is permanent — there is no inverse event. The other kinds are reversible via operator override (§8.6) or via a re-enabling event:

| Reversing event | Effect |
|---|---|
| RISC `account-enabled` | Operator override only — fence is cleared by operator action after a review. The event itself sets a finding to `resolved` but does not delete the fence. (Rationale: re-enabling at the IdP does not automatically restore the consumer's local trust state.) |
| Operator override endpoint (§8.6) | Direct fence deletion or expiry. Records `clearedBy`, `clearedAt`, `reason`. |

### 5.3 New Storage

content-api uses raw Drizzle, not Better Auth plugin schemas. The snippet below is illustrative — translate field types when writing to `src/infrastructure/db/schema.ts`:

```ts
// src/infrastructure/db/schema.ts — Phase 3 addition (Drizzle shape)
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const identityInvalidationFences = sqliteTable(
  "identity_invalidation_fences",
  {
    id: text("id").primaryKey(),
    fenceKind: text("fence_kind").notNull(),
    // composite key columns; nullable for kinds that do not use them
    userId: text("user_id"),
    organizationId: text("organization_id"),
    teamId: text("team_id"),
    clientId: text("client_id"),
    resourceAudience: text("resource_audience"),
    // the fence value
    tokensIssuedBefore: integer("tokens_issued_before").notNull(), // epoch seconds
    // provenance
    sourceEventId: text("source_event_id")
      .notNull()
      .references(() => identityEventReceipts.eventId),
    sourceEventTypeUri: text("source_event_type_uri").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // operator override state
    clearedAt: integer("cleared_at", { mode: "timestamp_ms" }),
    clearedBy: text("cleared_by"),
    clearReason: text("clear_reason"),
  },
  (table) => [
    index("identity_invalidation_fences_user_idx").on(table.fenceKind, table.userId),
    index("identity_invalidation_fences_workspace_idx").on(table.fenceKind, table.organizationId, table.userId),
    index("identity_invalidation_fences_team_idx").on(table.fenceKind, table.organizationId, table.teamId, table.userId),
    index("identity_invalidation_fences_client_idx").on(table.fenceKind, table.clientId),
  ],
);
```

Composite uniqueness per `fenceKind` is **not** enforced as a unique index. Multiple rows may exist for the same key (append-only by design, §6.4); only the highest-`tokensIssuedBefore` non-cleared row is consulted at verification time. Indices target the lookup paths in §8.1.

### 5.4 `Actor` Contract Change

Phase 3 adds the verified token-issuance timestamp to the existing discriminated-union `Actor` and introduces a *parallel projection*, `AuthorizationActor`, that carries the expanded principal set. The current `Actor` shape is preserved; this minimizes blast radius across content-api callsites (decision E).

```ts
// src/domain/auth/actor.ts — Phase 3 additions

// Existing variants gain `iat`. No other fields change.
export type UserActor = {
  type: "user";
  id: string;
  subject: string;
  role: "admin" | "user";
  scopes: readonly string[];
  organizationId?: string;
  teamIds: readonly string[];
  email?: string;
  name?: string;
  avatar?: string;
  iat: number; // ← new: epoch seconds, required
};

export type ServiceAccountActor = {
  type: "service_account";
  clientId: string;
  organizationId: string;
  scopes: readonly string[];
  iat: number; // ← new
};

// `SystemActor` is unchanged — it is not produced from a bearer token.

// New projection consumed by ContentPolicy.can(). Produced by
// expandTokenPrincipals(actor) after the bearer-token use case returns.
export type AuthorizationActor = {
  readonly actor: Actor;                                  // the raw, projected token
  readonly principals: ReadonlyArray<TokenPrincipal>;     // possibly reduced by fence checks
};
```

`ContentPolicy.can()` is updated to accept `AuthorizationActor` instead of `Actor`. The change is mechanical: callsites that previously passed an `Actor` now pass `expandTokenPrincipals(actor, ctx)`. Callsites that do not invoke `ContentPolicy.can()` (e.g., routes that only read `actor.sub` or `actor.scopes`) keep using the existing `Actor` type unchanged.

Tokens without `iat` are rejected at `AuthenticateBearerTokenUseCase` with a clear error (`token_missing_iat`). `id` always issues with `iat`, so this is enforcement of an existing standard.

### 5.5 Denial Point

Denial occurs in token-principal expansion. The output is an `AuthorizationActor` carrying a *possibly reduced* principal set; `ContentPolicy.can()` consumes the projection. This preserves the local-authorization model and confines the new logic to a single boundary.

```text
AuthenticateBearerTokenUseCase
   → verify (signature, aud, iss, scopes, iat-required)
   → return raw Actor (existing union shape, now with iat)

expandTokenPrincipals(actor, ctx)         (new pure function, Phase 3)
   → derive candidate principals from actor (user-self, workspace, team-derived, service-account)
   → for each candidate principal:
       max_t = fenceRepo.maxTokensIssuedBefore(kind, key)
       if max_t != null and actor.iat <= max_t:
         exclude principal
   → return AuthorizationActor { actor, principals }

ContentPolicy.can(authorizationActor, action, resource)
   → body unchanged; reads from authorizationActor.principals
     and authorizationActor.actor where it previously read actor directly
```

The principal-derivation logic that currently lives inside `ContentPolicy.can()` (or its helpers) moves into `expandTokenPrincipals`. `ContentPolicy.can()` becomes a pure binding/denial evaluator over the supplied principal set. Routes that only read scalar fields (`actor.sub`, `actor.scopes`) keep their existing `Actor` parameter.

### 5.6 Direct-Share Rule, Re-Stated

A user removed from `org_1` may legitimately retain direct-share access to resources owned within `org_1` because direct-share is an explicit owner grant, not a derived workspace authority. Phase 3 fence enforcement:

- `workspace` fence for `(org_1, user_alice)` excludes the **workspace-derived** principal (the one carrying `org_id = org_1` in token claims) for tokens with `iat` ≤ the fence value.
- It does **not** affect a binding row that names `user_alice` as a *direct-share* principal on a specific resource owned within `org_1`. That binding is consulted unchanged by `ContentPolicy.can()` against the user-self principal, which is not workspace-derived.
- Similarly, a `team` fence excludes only the team-derived principal; it does not affect any binding naming the user as a direct-share principal.

The implementation enforces this by structuring fences to match **principal kinds**, not raw user IDs. A `workspace` fence is checked against workspace-derived principals only. A `user-disabled` fence is checked against all principals derived from that user, because the account itself is gone.

## 6. Architecture Decisions

### 6.1 Enforce In Token Principal Expansion, Not In `ContentPolicy.can()` Body

**Recommended**: `ExpandTokenPrincipals` filters before `ContentPolicy.can()` runs.

**Rejected**: thread fences into `ContentPolicy.can()` itself. Would entangle authorization logic with identity-event consumption and require touching every callsite of `can()`.

**Reasoning**: principals are the natural choke point. Excluding a principal at expansion time matches how the system already reasons about token-derived authority versus binding-defined authority.

### 6.2 Require Verified `iat` On All Bearer Tokens

**Recommended**: `AuthenticateBearerTokenUseCase` rejects tokens without `iat`, error code `token_missing_iat`.

**Rejected**: treat missing `iat` as "no fence applies." Permissive but creates a downgrade path — a token lacking `iat` would bypass fences entirely. Even though `id` always issues with `iat`, the verifier MUST enforce its presence so that any future issuer (or misissued token) is rejected.

**Reasoning**: defense in depth. The fence contract relies on `iat`; the verifier must enforce that contract.

### 6.3 Fence Updates Run In The Event Handler Transaction

**Recommended**: when a fence-producing event is received, the handler inserts both the `identityEventReceipts` row and the `identityInvalidationFences` row in the same DB transaction. If either fails, the receiver returns 5xx and the producer retries.

**Rejected**: insert receipt first, schedule fence write asynchronously. Creates a window where the consumer has acknowledged the event but does not enforce it.

### 6.4 Fences Are Monotonic By `tokens_issued_before`

**Recommended**: at verification time, look up the **maximum** `tokensIssuedBefore` value across all non-cleared fence rows that match the principal key. Older fences are not deleted; they are simply not the active row.

**Rejected**: in-place update. Loses provenance — operators cannot reconstruct *which event* drove the current fence.

**Reasoning**: append-only fences make audit, replay, and operator-investigation simple. Storage cost is negligible at expected event rates.

### 6.5 Fence Lifetime Is Indefinite Until Re-Enable Or Operator Action

**Recommended**: fences persist until:

- An operator explicitly clears them via §8.6, or
- A handler determines an inverse event has fully restored the principal's authority (rare; reserved for `account-enabled` after operator review).

**Rejected**: TTL-based auto-clear (e.g., clear `workspace` fences after 7 days). Creates a re-enable hazard — a stale token from before the original event could become valid again purely by clock advancement.

**Reasoning**: `iat`-based fences are naturally self-limiting because any token with `iat ≤ fence.tokens_issued_before` would have expired within the JWT TTL anyway. The fence is only needed *during* that window. Keeping the fence row after the window simply means the check returns "no token has an `iat` that low" and is harmless. Carrying the row indefinitely is operationally simpler than scheduled cleanup.

### 6.6 Parallel `AuthorizationActor` Projection Over Flat `Actor` Rewrite

**Recommended**: introduce a new `AuthorizationActor` projection consumed by `ContentPolicy.can()`. Keep the existing `Actor` discriminated union intact except for an additive `iat` field on the variants that are produced from a bearer token.

**Rejected**: flatten `Actor` into a single interface with a `principals` field. Touches every route, repo, and use case that constructs or reads an actor; the blast radius is enormous for what is mechanically an authorization concern.

**Rejected**: thread fence checks into `ContentPolicy.can()` body directly. Re-runs principal derivation on every `.can()` call and entangles authorization with identity-event state at the wrong layer.

**Reasoning**: the fence concern is "what principals does this token currently legitimately represent" — a *projection* over the raw token. Modelling it as a separate type keeps the bearer-token use case's contract narrow ("token in, claims-shaped Actor out") and lets the authorization layer ask the new question ("expanded principals for this token") on its own boundary. No standard is violated either way (fence checks are entirely consumer-side; SSF/RISC/CAEP have nothing to say about how the consumer organizes its types); this is purely a content-api code-organization choice that minimizes diff size.

## 7. Implementation Strategy

1. **Schema + migration** — add `identityInvalidationFences`.
2. **Handler updates** — RISC, CAEP, and approved extension handlers (from docs 015 §7.5 and 015 §8) gain a fence-write step alongside their finding-write step, behind feature flag `IDENTITY_EVENTS_FENCE_ENABLED`.
3. **`Actor` change** — require `iat`, carry through use case.
4. **Token-principal expansion** — new pure function reading fence state.
5. **Repository + caching** — fence read path is hot; cache by principal key with short TTL (e.g. 30s) and invalidate on local fence write.
6. **Operator override endpoints** — list, clear with reason.
7. **SLA documentation** — write the explicit delivery-bound revocation SLA into the skill folder and into [013](013_identity-event-standards-and-decisions.md).

Each step ends at a `pnpm check` green state in `content-api`.

## 8. Detailed Implementation Plan

### 8.1 Schema And Migration

Current problem:

- No fence table; doc 015 only ships receipts and findings.

Target behavior:

- New table per §5.3.

Implementation tasks:

- [ ] Add `identityInvalidationFences` to `src/infrastructure/db/schema.ts`.
- [ ] Add indices:
  - `(fenceKind, userId)` for `user-disabled` and `user-purged` lookups.
  - `(fenceKind, organizationId, userId)` for `workspace` lookups.
  - `(fenceKind, organizationId, teamId, userId)` and `(fenceKind, organizationId, teamId)` for `team` and `team-deleted`.
  - `(fenceKind, clientId)` and `(fenceKind, clientId, organizationId, resourceAudience)` for service-account fences.
- [ ] Generate migration.

Tests:

- Migration applies cleanly.

### 8.2 Handler Updates To Write Fences

Current problem:

- Doc 015 handlers write findings only. No fence side effects.

Target behavior:

- Each fence-producing handler (per §5.2) additionally inserts an `identityInvalidationFences` row inside the same transaction. The fence is gated by a feature flag `IDENTITY_EVENTS_FENCE_ENABLED`. When the flag is off, the behavior is doc 015 (audit only).

| Handler | Fence written |
|---|---|
| `account-disabled` | kind `user-disabled`, key `user_id`, local `tokens_issued_before` derived from SET `toe`. |
| `account-purged` | kind `user-purged`, key `user_id`. Permanent. |
| `account-enabled` | **No automatic clear**. Finding flips to `resolved` (doc 015), but fence remains; operator clears explicitly. |
| `identifier-changed` | No fence — identifier change does not invalidate authority on principal-ID basis. |
| `session-revoked` (Phase 2 CAEP) | No fence — sessions are browser-side; JWTs are not session-bound. |
| `organization-member-removed` (repo) | kind `workspace`, key `(org_id, user_id)`. |
| `team-member-removed` (repo) | kind `team`, key `(org_id, team_id, user_id)`. |
| `oauth-client-disabled` (repo) | kind `service-account-disabled`, key `client_id`. |
| `credential-change` (actual client-secret revoke) | kind `service-account-disabled`, key `client_id`; accept only CAEP `change_type: revoke`. |
| `team-deleted` (repo) | kind `team-deleted`, key `(org_id, team_id)`. |
| `oauth-client-grant-disabled` (repo) | kind `service-account-grant`, key `(client_id, org_id, resource)`. |

Implementation tasks:

- [ ] Extract fence-writing logic into a helper `WriteFenceFromEvent` in `src/application/identity/`.
- [ ] Update each handler in `src/application/identity/handlers/` to call the helper when the feature flag is on.
- [ ] Add local `tokens_issued_before` derivation logic: read required CAEP `event_timestamp` for CAEP fence-producing events and SET `toe` for RISC or repository-specific fence-producing events. Missing source event time is a malformed enforcement event; do not silently substitute receipt time.

Tests:

- Per-handler unit test: with flag on, a fence row exists with the expected key.
- Property test: receipt insert failure rolls back the fence insert (atomicity).
- Property test: feature flag off → no fence rows ever written.

### 8.3 `AuthenticateBearerTokenUseCase` Changes

Current problem:

- `iat` is not required or projected onto `Actor`.

Target behavior:

- Verify `iat` is a positive integer epoch second within a reasonable range (e.g., between Jan 1 2020 and now+30s for clock skew).
- Set `actor.iat = iat`.
- Reject with `token_missing_iat` if absent. Reject with `token_iat_invalid` if out of range.

Implementation tasks:

- [ ] Modify `src/application/auth/authenticate-bearer-token.usecase.ts` to add `iat` extraction and validation.
- [ ] Modify `src/domain/auth/actor.ts` to add `iat: number` to `UserActor` and `ServiceAccountActor`. Leave `SystemActor` unchanged.
- [ ] No mass callsite update is required because the `Actor` shape stays a discriminated union (decision E). Adding a required field is a purely additive type change for code that constructs the actor — TypeScript will surface the bearer-token use case as the construction site, and consumers that read `actor.iat` are introduced in §8.4 only.

Tests:

- Unit test: token with `iat = now-100` → accepted, projected.
- Unit test: token without `iat` → rejected with `token_missing_iat`.
- Unit test: token with `iat = now+3600` (clock skew large) → rejected with `token_iat_invalid`.
- Regression test: existing JWT verification tests still pass.

### 8.4 Token Principal Expansion Updates

Current problem:

- Token-principal expansion does not consult fences.

Target behavior:

- A function `expandTokenPrincipals(actor, ctx): AuthorizationActor` returns the actor plus a `principals` set reduced by fence checks. Pure: no DB writes.

Implementation tasks:

- [ ] Add `src/application/iam/expand-token-principals.ts` returning `AuthorizationActor` per §5.4.
- [ ] Move principal-derivation logic (user-self, workspace, team-derived, service-account) out of `ContentPolicy.can()` (or its helpers) into this function. This is the only structural refactor; locate it during the spike.
- [ ] For each candidate principal type, look up fence rows by composite key and check `actor.iat <= max(fence.tokensIssuedBefore for non-cleared rows)`. Exclude the principal if true.
- [ ] Update `ContentPolicy.can()` to accept `AuthorizationActor` instead of `Actor`. The body change is to read from `authorizationActor.principals` (new) and `authorizationActor.actor` for scalar fields it currently reads off `actor` directly.
- [ ] Wire `expandTokenPrincipals` into the request lifecycle, after `authenticate-bearer-token` and before `ContentPolicy.can()`. Only callsites that invoke `ContentPolicy.can()` need updating; routes that just inspect `actor.sub` / `actor.scopes` are unaffected.

Tests:

- Unit test: token with `iat = T - 1`, fence `tokens_issued_before = T` → workspace principal excluded.
- Unit test: token with `iat = T + 1`, same fence → workspace principal admitted.
- Property test: direct-share user binding survives `workspace` fence for the same user (§5.6).
- Property test: `user-disabled` fence excludes all user-derived principals but does **not** exclude an unrelated service-account principal in the same actor.

### 8.5 Fence Repository

Current problem:

- No read path.

Target behavior:

- `IdentityFenceRepository.maxTokensIssuedBefore(fenceKind, key): number | null` returns the maximum non-cleared `tokensIssuedBefore` for the matching rows, or `null` if none exist.
- Result is cached in-process per request (KV cache is not warranted at expected fence-row counts).

Implementation tasks:

- [ ] Add `src/infrastructure/persistence/identity-fences.repository.ts`.
- [ ] Provide per-request memoization in the request container.
- [ ] Do not add cross-request caching in first implementation — the fence read is O(1) by index and cheap.

Tests:

- Unit test: repository returns max across multiple non-cleared rows.
- Unit test: cleared rows are ignored.

### 8.6 Operator Override Endpoints

Current problem:

- Operators cannot intervene on fences directly.

Target behavior:

- `GET /admin/internal/id-events/fences?fenceKind=...` — list active fences.
- `POST /admin/internal/id-events/fences/:id/clear` — body `{ reason: string }`. Sets `clearedAt`, `clearedBy = actor.sub`, `clearReason = reason`. Append-only — the row is not deleted.
- `POST /admin/internal/id-events/fences/clear-by-key` — body `{ fenceKind, ...keyFields, reason }`. Bulk clear all non-cleared rows matching the key. Used in re-enable workflows.

Authorization:

- Admin-only via the same path as doc 015 §7.7.

Implementation tasks:

- [ ] Add `src/http/routes/admin/id-fences.routes.ts`.
- [ ] Add `list-fences.usecase.ts` and `clear-fence.usecase.ts`.

Tests:

- Integration test: operator clears a fence by ID → subsequent lookups return `null`.
- Integration test: bulk clear by key.
- Integration test: non-admin → 403.

### 8.7 SLA Documentation Updates

Current problem:

- Phase 3 introduces a delivery-bound revocation SLA. Without explicit documentation, users may misread this as "immediate revocation."

Target behavior:

- Add a "Delivery-Bound Revocation SLA" section to the `content-iam-usage` skill that states the agreed SLA in writing (e.g. "P95 fence application within 60 seconds of identity mutation under nominal delivery conditions; up to {producer DLQ retry window} during outage").
- Cross-reference this doc and doc 013 D5 in the skill.
- Add a runbook entry in [docs/007_cloudflare-deployment-runbooks.md](007_cloudflare-deployment-runbooks.md) for fence-related operator workflows.

Implementation tasks:

- [ ] Update the `content-iam-usage` skill.
- [ ] Update the runbook.
- [ ] Amend [013](013_identity-event-standards-and-decisions.md) D5 with the recorded SLA value.

## 9. Migration And Rollout

- The fence table ships in one additive migration; no existing table is altered.
- `AuthenticateBearerTokenUseCase` change is breaking only for issuers that omit `iat`. `id` always issues with `iat`; verify in a pre-deploy spike.
- Feature flag `IDENTITY_EVENTS_FENCE_ENABLED` gates fence writes and fence reads. Both must flip together:
  - With flag off: handlers do not write fences, expansion does not consult fences, behavior is exactly doc 015.
  - With flag on: behavior is full Phase 3.
- Recommended deploy order:
  1. Deploy `content-api` with the new use case requiring `iat`, fence schema applied, feature flag **off**. Verify all tokens carry `iat` and the new test suite is green.
  2. Operator turns on the producer's CAEP emission (doc 014 §8 flag) if not already on.
  3. Flip `IDENTITY_EVENTS_FENCE_ENABLED=true` in `content-api`.
  4. Smoke-test: trigger a synthetic event in `id` and confirm a fence appears in `content-api` and a stale token is denied.
- Rollback: flip the flag to `false`. Fence rows remain; the read path stops consulting them. Re-enabling later resumes enforcement from the existing rows (no replay needed because the fence keys are time-monotone).

## 10. Edge Cases And Failure Modes

| Scenario | Expected handling |
|---|---|
| Token has no `iat` | Rejected by `AuthenticateBearerTokenUseCase` (`token_missing_iat`). Operationally: every `id`-issued token has `iat`, so this is a defense-in-depth gate. |
| Event arrives before token issuance, then token arrives | Token's `iat` > fence's `tokensIssuedBefore` → admitted. Correct. |
| Token issued, then event commits, then token presented | Token's `iat` ≤ fence's `tokensIssuedBefore` → principal excluded. Correct. |
| Token and event commit in the same second | `iat <= tokens_issued_before` is true -> token excluded. This is the consumer's documented fail-closed boundary when it derives the cutoff from `event_timestamp` or `toe`; CAEP does not prescribe the fence comparison. |
| Event delivery is delayed (producer DLQ backlog) | The fence does not exist yet at the consumer; tokens are admitted. After the event eventually commits, future presentations of the same token are denied. This is the documented SLA boundary (§8.7). |
| Fence row written but operator immediately overrides | Subsequent expansion sees `clearedAt != null` → fence ignored → principal admitted. |
| Multiple fences for the same key, different `tokens_issued_before` values | Use max. Older fences remain for audit; newer fence (higher value) governs. |
| Re-enable event (`account-enabled`) without operator action | Fence remains. Operator must explicitly clear via §8.6. Documented to prevent automatic un-revocation. |
| Direct-share user binding present when `workspace` fence is active | Direct-share binding evaluated under user-self principal, which is not workspace-derived → admitted. (Tested.) |
| `user-disabled` fence present when user also has a direct-share binding | The account is disabled; all user-derived principals (including user-self) are excluded. Direct-share binding is therefore not honored. This differs from the `workspace` fence behavior and is correct: account disabled is a stronger statement than membership removed. |
| Fence repository returns inconsistent results during concurrent writes | Per-request memoization isolates a single request. Cross-request consistency is eventual — acceptable for a delivery-bound SLA. |
| `IDENTITY_EVENTS_FENCE_ENABLED` is off but `IDENTITY_EVENTS_CAEP_ENABLED` is on | Handlers still write findings (audit), but no fence rows are written. Switching the flag on later starts fencing from new events forward; old events do not retroactively create fences. Operator runbook documents this as a known constraint. |
| Multiple `content-api` instances see fences with bounded propagation lag | Acceptable. Fence values are not strictly monotone in wall-clock time across instances; per-instance reads see eventually consistent fence state. The SLA accounts for this. |
| Operator clears a fence with an active in-flight token that would have been excluded | Token admitted on next verification. Operator action overrides the producer event. Audit trail in `clearedBy` / `clearedAt` / `clearReason`. |

## 11. Test And Verification Plan

Automated:

- `src/application/iam/__tests__/expand-token-principals.test.ts` — every fence kind × admit/exclude.
- `src/application/identity/handlers/__tests__/*.test.ts` — fence rows written with correct keys per event.
- `src/application/auth/__tests__/authenticate-bearer-token-iat.test.ts` — iat required, projected, validated.
- `src/infrastructure/persistence/__tests__/identity-fences.repository.test.ts` — max-non-cleared semantics.
- `src/http/routes/admin/__tests__/id-fences.routes.test.ts` — operator override behavior.
- Property test in `src/domain/iam/__tests__/policy-fence-interaction.test.ts`:
  - For random sequences of (token issuance, fence-producing event, override), assert that `ContentPolicy.can()` outcomes match the expected fence semantics.
  - Direct-share survives workspace fence.
  - User-disabled excludes all user-derived principals.

Manual:

- Local dual-stack: trigger producer events for each fence kind via `pnpm auth:api` calls; observe fence rows; present a pre-event JWT; confirm denial.
- Remote: same flow against staging.

Commands:

- `pnpm check` in `/home/quanghuy1242/pjs/content-api`.
- `pnpm advise` after substantial changes.

## 12. Definition Of Done

Phase 3 fence enforcement is done when:

- All §8 tasks complete and tested.
- `pnpm check` green in `content-api`.
- The recorded operational requirement from §2 trigger condition #3 is satisfied — i.e., the scenario that motivated this work has been demonstrated end-to-end (event fires, fence written, stale token denied, post-event token admitted).
- The Delivery-Bound Revocation SLA section is published in the `content-iam-usage` skill, the runbook is updated, and [013](013_identity-event-standards-and-decisions.md) D5 records the SLA values.
- Neither this doc nor any other doc, runbook, or skill describes the fence as "immediate revocation." All references state the delivery-bound nature explicitly.

## 13. Final Model

```text
content-api consumer (Phase 3 fence enforcement)
────────────────────────────────────────────────
incoming bearer token
  ├── AuthenticateBearerTokenUseCase
  │     verify sig, iss, aud, scopes
  │     verify iat present and valid     ← Phase 3 change
  │     project Actor (existing union, now with iat on user/service-account variants)
  │
  ├── expandTokenPrincipals(actor)        ← Phase 3 new step
  │     derive candidate principals from actor
  │     for each candidate principal kind:
  │       max_t = fenceRepo.maxTokensIssuedBefore(kind, key)
  │       if max_t != null and actor.iat <= max_t:
  │         exclude principal
  │     return AuthorizationActor { actor, principals }    ← parallel projection (decision E)
  │
  └── ContentPolicy.can(authorizationActor, action, resource)
        body unchanged — now reads principals from the projection

incoming SET (audit channel, doc 015)
  ├── verify, dedupe, dispatch
  └── handler:
        write finding row              (doc 015 behavior, unchanged)
        IF IDENTITY_EVENTS_FENCE_ENABLED:
          write fence row in same tx   ← Phase 3 addition

src/infrastructure/db/schema.ts
  + identityInvalidationFences

src/application/iam/
  expand-token-principals.ts            ← new

src/application/identity/
  write-fence-from-event.ts             ← new helper used by all fence-producing handlers
  list-fences.usecase.ts
  clear-fence.usecase.ts

src/http/routes/admin/
  id-fences.routes.ts                   ← new

src/application/auth/authenticate-bearer-token.usecase.ts
  + iat verification and projection

src/domain/auth/actor.ts
  + iat: number on UserActor and ServiceAccountActor
  + AuthorizationActor type (parallel projection — decision E)
```

Phase 3 yields a clear, scoped enforcement model: a small fence table, a single denial point, an explicit `iat` contract, an operator override path, and a documented delivery-bound SLA. Critically, the existing direct-share-survives rule is preserved, and `ContentPolicy.can()` remains untouched. If audit-only ever turns out to be enough, this doc remains paper and the system keeps doc 015's shape.
