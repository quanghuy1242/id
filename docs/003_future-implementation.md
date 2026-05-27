# id — Future Implementation

> Status: planning notes — revisit when first batch ships
>
> Date: 2026-05-25
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — the `id` identity provider monorepo
>
> Source docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/001_first-batch-plan.md`
> - `docs/010_organization-teams-oauth-flow.md`
> - CEL specification — `https://github.com/google/cel-spec`
> - Cloudflare Workers Analytics Engine — `https://developers.cloudflare.com/analytics/analytics-engine/`
> - Cloudflare Dynamic Workers — `https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/`
> - Better Auth plugin API — `https://better-auth.com/docs/concepts/plugins`

## Table Of Contents

- [1. Plugin Architecture Strategy](#1-plugin-architecture-strategy)
- [2. CEL Policy Engine (Replaces ABAC/Lua)](#2-cel-policy-engine-replaces-abaclua)
  - [2.1 Why CEL](#21-why-cel)
  - [2.2 Performance](#22-performance)
  - [2.3 Syntax And Capabilities](#23-syntax-and-capabilities)
  - [2.4 JS/TS Implementations](#24-jsts-implementations)
  - [2.5 Limitations](#25-limitations)
  - [2.6 Plugin Design](#26-plugin-design)
  - [2.7 Ecosystem Fit](#27-ecosystem-fit)
- [3. Onboarding Flows](#3-onboarding-flows)
- [4. Analytics And Metrics](#4-analytics-and-metrics)
- [5. Pipeline Hook System](#5-pipeline-hook-system)
  - [5.1 Overview — Porting auther's Lua Pipeline To id](#51-overview--porting-authers-lua-pipeline-to-id)
  - [5.2 Primary Design — QuickJS WASM + Dedicated Worker](#52-primary-design--quickjs-wasm--dedicated-worker)
  - [5.3 Plugin Design](#53-plugin-design)
  - [5.4 DAG Execution Engine](#54-dag-execution-engine)
  - [5.5 Example Pipeline Scripts](#55-example-pipeline-scripts)
  - [5.6 Auth0 Actions Parity](#56-auth0-actions-parity)
  - [5.7 Embedded Scripting Options (Compared)](#57-embedded-scripting-options-compared)
  - [5.8 Alternative — Dynamic Workers](#58-alternative--dynamic-workers)
- [6. Full Admin UI](#6-full-admin-ui)
- [7. Deferred OAuth Browser Pages](#7-deferred-oauth-browser-pages)
- [8. Deferred Admin Authorization Model](#8-deferred-admin-authorization-model)
- [9. API-First Scope Catalog, Token Claims, And Tooling](#9-api-first-scope-catalog-token-claims-and-tooling)
- [10. Identity Events, SCIM Directory, And M2M Principal Contracts (Docs 013-018)](#10-identity-events-scim-directory-and-m2m-principal-contracts-docs-013-018)
- [11. Design System Specification Format](#11-design-system-specification-format)

## 1. Plugin Architecture Strategy

All future features are Better Auth plugins, not standalone custom code. The first batch's `idResourceServer` plugin proves this pattern: a plugin owns its table definition via BA's `schema` system, its API endpoints via `createAuthEndpoint`, and its runtime behavior via BA hooks.

**Why plugins over custom code:**

- BA's CLI generates migrations for plugin schemas — no separate migration tooling.
- BA's adapter handles CRUD — no custom Drizzle queries.
- Plugin endpoints register automatically on the BA handler — no manual Hono route registration.
- BA version upgrades cover plugin schemas — no schema drift.

**Future plugin registry:**

| Plugin | Table | Purpose |
|---|---|---|
| `idResourceServer` | `resourceServer` | First batch — resource server management |
| `idOAuthScopeCatalog` | `oauthResourceScope`, `oauthClientOrganizationGrant` | API-first, UI-ready resource-server-bound OAuth scope catalog and optional M2M organization grants |
| `idCelPolicy` | `celPolicy` | CEL-based ABAC policy evaluation |
| `idOnboarding` | (extends org plugin) | Registration contexts, invite tokens |
| `idMetrics` | (no table) | Analytics Engine writes via BA hooks |
| `idPipeline` | `pipelineScript`, `pipelineExecutionPlan`, `pipelineSecrets` | QuickJS-based pipeline hook evaluation (with Dynamic Workers documented as alternative) |
| `idIdentityEvents` | `identityEventSubscription`, `identityEventOutbox`, `identityEventDelivery` | SET/SSF/RISC identity event producer ([docs 013-016](#10-identity-events-scim-directory-and-m2m-principal-contracts-docs-013-017)) |
| `idScimDirectory` | (read-only projection over Better Auth user/member/team tables) | Proposed read-only SCIM v2 directory for synchronous User/Group lookup ([doc 017](017_scim-directory-and-m2m-principal-contract.md)) |

**Plugin registration pattern:**

```ts
plugins: [
  organization(config.organization),
  jwt(config.jwt),
  oauthProvider({ ... }),
  idResourceServer(),
  idOAuthScopeCatalog(config.oauthScopes),
  idCelPolicy(config.cel),        // Future
  idOnboarding(config.onboarding), // Future
  idPipeline(config.pipeline),     // Future
]
```

## 2. CEL Policy Engine (Replaces ABAC/Lua)

### 2.1 Why CEL

The ABAC/Lua engine in `auther` used Wasmoon with a 20-engine pool, sandboxed Lua scripts, and OpenTelemetry tracing. This is incompatible with the id architecture:

- Workers have 128MB memory — a Wasmoon pool alone would consume 100MB baseline.
- Lua requires sandboxing which adds latency, complexity, and security surface.
- Auth0's authorization model stops at RBAC + scopes — none of the IdP competitors provide embedded Lua scripting.

CEL (Common Expression Language) is the industry standard for lightweight policy evaluation:
- **Non-Turing complete** — no sandboxing needed. Evaluates in O(n) time.
- **Nanosecond/microsecond latency** — measured, not estimated.
- **Used by Google IAM, Kubernetes Admission Policy, Envoy, Agentgateway** — not experimental.
- **C-like syntax** — familiar to every developer. No Lua learning curve.
- **`cel-go` has a YAML Policy format** — structured rules with match/output/condition semantics.

### 2.2 Performance

CEL performance is documented in the spec and verified by independent benchmarks. Simple predicates evaluate in nanoseconds on any implementation.

**Real benchmark data (cel-go optimized):**

| Expression | Latency | Allocs |
|---|---|---|
| `string_value == 'value'` | 59 ns/op | 1 |
| `x in ['a', 'b', 'c', 'd']` | 65 ns/op | 1 |
| `list.exists(e, e.contains('cd'))` | 579 ns/op | 10 |
| `list.filter(e, e.matches('^cd+')) == ['cde']` | 1,389 ns/op | 32 |
| `'formatted: %s, size: %d'.format([list, 2])` | 947 ns/op | 21 |

**cel-rust optimization results** (Howardjohn blog, 2026): The Rust CEL implementation reached **21 ns** for a header-lookup expression (within 2 ns of native), compared to 97 ns for cel-go and 147 ns for the unoptimized implementation. A real-world workload with ~20 expressions saw throughput rise from 86K QPS to **400K QPS** after optimizations (pre-compiled regex/CIDR, native type traversal, zero-alloc field resolution).

**Performance characteristics from the CEL spec:**
- **Without macros:** O(n) — linear in expression size + input size
- **With macros** (`all`, `exists`, `map`, `filter`): Can go super-linear, bounded by O(P × I) where P = expression size, I = input size
- **Macros are the only avenue for near-exponential cost** — can be disabled or depth-limited
- **Parse-once, evaluate-many:** Compilation (parse + type-check) is expensive (~10ms) but done once; the resulting `Program`/AST is **stateless, thread-safe, and cachable**
- **Optimization flag** (`cel.OptOptimize`): Pre-builds list/map literals and set membership tests at compile time, reducing eval latency by up to 50%

For per-token policy checks in a Worker: compile policies at admin CRUD time, store the AST, evaluate at sub-microsecond cost per token issuance.

### 2.3 Syntax And Capabilities

CEL uses C/C++/Java/JavaScript-like syntax. No learning curve for any developer.

**Operator precedence (lowest to highest):**

| Precedence | Operator | Associativity |
|---|---|---|
| 1 | `()`, `.`, `[]`, `{}` | L→R |
| 2 | `-` (unary), `!` | R→L |
| 3 | `*`, `/`, `%` | L→R |
| 4 | `+`, `-` (binary) | L→R |
| 5 | `==`, `!=`, `<`, `>`, `<=`, `>=`, `in` | — |
| 6 | `&&` | L→R |
| 7 | `\|\|` | L→R |
| 8 | `?:` (ternary) | R→L |

**Types:**
- `int` (64-bit signed), `uint` (64-bit unsigned), `double` (64-bit float)
- `bool`, `string`, `bytes`
- `list(A)`, `map(A, B)`
- `null_type`, `type` (first-class types)
- `google.protobuf.Timestamp`, `google.protobuf.Duration`
- `dyn` (gradual typing — defers to runtime)
- No implicit coercion between int/uint/double — must use `double(x)`, `int(x)`, etc.

**Standard functions (partial):**

| Category | Functions |
|---|---|
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `==`, `!=`, `<`, `<=`, `>=`, `>`, `in` |
| Logical | `&&`, `\|\|`, `!` |
| String | `contains()`, `startsWith()`, `endsWith()`, `size()`, `matches()` (RE2) |
| Collection | `size()`, `in`, `[]` indexing |
| Type | `type()`, `has()`, conversions (`int()`, `double()`, `string()`, etc.) |
| Time | `timestamp()`, `duration()`, `getDate()`, `getFullYear()` |
| **Macros** | `all()`, `exists()`, `exists_one()`, `filter()`, `map()` |

**Safety by construction:**
- Non-Turing complete — guaranteed termination, no infinite loops
- No side effects — pure functions only, cannot mutate bindings
- No I/O — cannot read files, make network calls, or access memory outside the host
- No sandbox needed — safe by language construction, unlike JS/Lua
- Commutative logic — `&&` and `\|\|` evaluate both sides on error/unknown (SQL-style partial-state semantics)
- Bounded resources — implementations enforce limits (32 `\|\|` terms, 24 ternaries, 12 nested function calls)
- Gradual typing — type-check at compile time when possible, defer `dyn` types to runtime

**Real-world production usage:**
- **Google Cloud IAM** — condition-based access policies, billions of evaluations/day
- **Kubernetes ValidatingAdmissionPolicy** (GA since 1.30) — in-process API server validation
- **Kubernetes CRD Validation Rules** (since 1.23) — `x-kubernetes-validations` for custom resources
- **Envoy RBAC filter** — per-request HTTP/network access control
- **Istio Mixer** — attribute-based service mesh policy
- **Firebase Security Rules** — real-time DB access rules
- **Google CEL Policy Templates** — templated policy evaluation for admission/access/networking

### 2.4 JS/TS Implementations

For Cloudflare Workers, CEL runs as a native JS package — no WASM compilation, no sandbox overhead.

| Package | Weekly Downloads | Size | Dependencies | Notes |
|---|---|---|---|---|
| **`@marcbachmann/cel-js`** v7.6.1 | 229K | 222 KB | **0** | Fastest JS tree-walker, ~10x faster than cel-js, full spec coverage including macros |
| **`@bufbuild/cel`** v0.5.0 | 285K | 846 KB | 1 (protobuf) | Buf's official impl, deep protobuf integration |
| `cel-js` (ChromeGG) v0.8.2 | 39K | 67 KB | 2 | Original JS impl, slower, less complete |
| `@marvec/cel-vm` | New | — | **0** | Bytecode VM compiler, serializable to Base64 for DB storage |

**Recommended for `idCelPolicy`:** `@marcbachmann/cel-js` — zero dependencies, 222 KB unpacked (small), ESM, full TypeScript, full spec coverage.

### 2.5 Limitations

CEL is a **single-expression** language. It has:
- No statements — just one expression evaluated to one value
- No variables — no `var x = ...`, no mutation
- No multi-line — everything is one expression
- No sequencing — no "do A, then B"
- No user-defined functions

The ternary `?:` and collection macros (`all`, `exists`, `filter`, `map`) are the only "control flow" constructs. CEL is perfect for **per-token policy checks** ("is user on pro plan?", "is amount < $1000?") but cannot express multi-step pipeline logic ("check domain → call threat API → validate → enrich claims").

**This is by design.** CEL handles single-decision policy evaluation. The pipeline hook system (Section 5) handles multi-step procedural logic. Together they cover the full auther Lua surface:

| Concern | CEL | Pipeline |
|---|---|---|
| Per-token condition checks | Yes (nanosecond eval) | No |
| Multi-step hooks with fetch/secret | No | Yes |
| Permission-level ABAC policies | Yes | No |
| External API calls in auth flow | No | Yes |
| JWT claim enrichment | Yes (via `cel` function) | Yes (via enrichment mode) |

### 2.6 Plugin Design

The `idCelPolicy` plugin provides:
- A `celPolicy` table — stores named policies with CEL expressions, per-organization.
- A CEL evaluator — compiles expressions at policy creation time, evaluates at token issuance time against JWT claims + request context.
- A `cel` function — callable from `customAccessTokenClaims` to inject policy evaluation results into tokens.

**Example policy (admin dashboard):**

```yaml
name: billing-access
description: Allow billing operations for org owners on pro plan
rule:
  match:
    - condition: context.user.org_role == "owner" && context.user.plan == "pro"
      output: "true"
    - output: "false"
```

**Runtime flow:**

```
Token issuance → idCelPolicy.evaluate(claims, context)
  → compile & cache CEL expression
  → evaluate against input
  → return result (boolean, or enrich claims)
```

**CEL advantages over auther's Lua:**
- No sandbox — CEL is safe by construction.
- No memory pool — stateless evaluation.
- No Worker memory limit concern.
- Parse-once, evaluate-many with compiled AST caching.
- Type-checked at parse time, not at runtime.

### 2.7 Ecosystem Fit

CEL complements the first-batch RBAC model:
- RBAC handles coarse-grained access (owner/admin/member → resource:action).
- CEL handles fine-grained conditions (can refund only if amount < $1000, can access only during business hours, can manage only own-team resources).
- Both are evaluated at token issuance time — no runtime callbacks to the IdP for every API request.

## 3. Onboarding Flows

### 3.1 Alignment With Better Auth

The `organization` plugin already handles invitations (`inviteMember`, `acceptInvitation`, `rejectInvitation`). The gap is custom registration flows:

| Feature | Better Auth support | Custom work needed |
|---|---|---|
| Email/password sign-up | Built-in | None |
| Organization invitations | Built-in | None |
| `prompt=create` during OAuth | Built-in | Sign-up page |
| Domain-restricted sign-up | None — build via hooks | `beforeEmailSignUp` hook checks domain |
| Invite-only sign-up | None — build via hooks | Custom invite token validation |
| Automatic permission grants on join | None — build via hooks | `afterCreateMember` hook applies grants |

### 3.2 Plugin Design

The `idOnboarding` plugin extends the organization plugin via hooks:
- Validates invite tokens on `beforeEmailSignUp`.
- Applies automatic permission grants on `afterCreateMember`.
- Generates HMAC-signed invite tokens with configurable expiry.

**Why a plugin, not custom code:**
- Hooks are the standard BA extension mechanism.
- Invite token generation can reuse BA's crypto helpers.
- No custom tables needed — invite state lives in the org plugin's `invitation` table with additional metadata.

## 4. Analytics And Metrics

### 4.1 Cloudflare Workers Analytics Engine

Workers Analytics Engine is purpose-built for this use case:
- **Non-blocking writes:** `writeDataPoint()` returns immediately, no latency impact on auth flows.
- **High-cardinality:** blobs support customer IDs, org IDs, client IDs as dimensions.
- **SQL API + Grafana:** query for dashboards, export to external tools.
- **Use cases from docs:** custom business metrics, per-customer analytics, usage-based billing, performance tracking.

### 4.2 Plugin Design

The `idMetrics` plugin writes data points via BA hooks. No custom tables — data lives in Analytics Engine datasets.

**Ops dataset (`id-ops`):**

| Blob (dimension) | Double (measure) | Event |
|---|---|---|
| `grant_type` | count | Token issuance |
| `grant_type`, `client_id` | count, latency_ms | Token issuance per client |
| `scope` | count | Scope usage |
| `reason` | count | Auth failure |
| `kid` | count | JWKS hit |

**User-facing dataset (`id-usage`):**

| Blob (dimension) | Double (measure) | Event |
|---|---|---|
| `org_id`, `client_id` | count | Per-org per-client token volume |
| `org_id`, `user_id` | count | Per-org per-user login activity |
| `org_id`, `resource` | count | Per-org per-resource API usage |

**Why Analytics Engine, not D1:**
- Zero latency impact — non-blocking writes.
- No custom table to maintain and migrate.
- Designed for high-cardinality time-series data.
- SQL API + Grafana for both ops and user-facing dashboards.
- Cost scales with data volume, not query count.

## 5. Pipeline Hook System

### 5.1 Overview — Porting auther's Lua Pipeline To id

The `auther` pipeline engine (Wasmoon + Lua + DAG execution) is one of the strongest architectural components. Its design warrants a full port to `id` — not a line-for-line rewrite (Lua → JS, Wasmoon → QuickJS, in-process → Worker boundary) but preserving the same DAG plan format, execution modes, and hook contracts.

**Why a full port, not reuse:**
- Lua is unfamiliar to most developers. JS is the Workers-native language.
- Wasmoon (1.5 MB WASM bundle, 20-engine pool, 30+ lines of sandbox setup) is heavy and complex in the Workers model.
- In-process execution means a misbehaving script can crash the auth Worker.
- The pipeline is a distinct security boundary and should be a distinct Worker.

### 5.2 Primary Design — QuickJS WASM + Dedicated Worker

```
Core Worker (auth)                  Pipeline Worker
┌──────────────────────┐    Service Binding    ┌──────────────────────────┐
│  BA hooks (signup,   │                      │  QuickJS WASM (880 KB)   │
│  signin, token, etc) │ ◄──────────────────► │  ┌────────────────────┐  │
│                      │   POST /evaluate      │  │ Pipeline scripts   │  │
│  CEL per-token       │   ~0.5-1ms hop       │  │ from D1            │  │
│  policy checks       │                      │  │                    │  │
└──────────────────────┘                      │  │ Secrets from D1    │  │
                                              │  │ (encrypted)        │  │
                                              │  └────────────────────┘  │
                                              │                          │
                                              │  DAG execution engine    │
                                              │  Fail-open design        │
                                              │  CPU deadline guard      │
                                              └──────────────────────────┘
```

**QuickJS specifics:**

| Metric | Value |
|---|---|
| Package | `quickjs-emscripten` (`@jitl/quickjs-ng-wasmfile-release-asyncify`) |
| WASM bundle | ~880 KB gzipped |
| WASM compilation | ~10ms (once at Worker boot, cached across requests) |
| Context creation | ~0.3ms (per-request, fresh isolated JS heap) |
| Script eval | ~0.5-1ms (typical pipeline script) |
| Memory per context | ~0.1 MB |

QuickJS (Fabrice Bellard) is a small, embeddable JS engine supporting ES2023. The `quickjs-emscripten` package compiles it to WASM with first-class Cloudflare Workers support (targets `workerd` environment). The **asyncify** variant enables `await helpers.fetch()` natively inside scripts — matching auther's `await(helpers.fetch())` via Lua coroutines.

**Security — no sandbox code needed:**

auther required 30+ lines of sandbox:
```
os = nil, io = nil, package = nil, require = nil,
loadfile = nil, dofile = nil, loadstring = nil, load = nil,
rawset = nil, rawget = nil, getfenv = nil, setfenv = nil
```
Plus `debug.sethook` instruction counting, timeout wrapping, and pool management.

QuickJS needs **none of this**. The WASM VM is the isolation boundary — the script has zero access to the Worker's scope, globalThis, or any host API except what you explicitly register via `ctx.setProp()`. No `require()`, no `process`, no `fetch()` unless you pass it in.

**Worker isolation as defense-in-depth:**

Even if QuickJS has a zero-day, the pipeline runs in a different Worker from auth. A crash or exploit in the pipeline cannot touch:
- JWT signing keys
- User/password data
- Session state
- OAuth client secrets
- Any auth-critical state

### 5.3 Plugin Design

The `idPipeline` plugin provides:
- `pipelineScript` table — stores scripts per organization, per event type
- `pipelineExecutionPlan` table — stores the DAG plan (`string[][]`) per trigger event
- `pipelineSecrets` table — stores AES-256-GCM encrypted secrets accessible via `helpers.secret("KEY")`
- BA hook integration — calls the pipeline Worker via Service Binding on relevant auth events

**Tables:**

```sql
pipeline_scripts:
  id          TEXT PRIMARY KEY
  name        TEXT NOT NULL
  code        TEXT NOT NULL          -- JS source code
  config      TEXT                   -- JSON, default variables
  org_id      TEXT NOT NULL REFERENCES organization(id)
  created_at  INTEGER
  updated_at  INTEGER

pipeline_execution_plan:
  trigger_event  TEXT PRIMARY KEY    -- e.g. 'before_signup'
  org_id         TEXT NOT NULL REFERENCES organization(id)
  plan           TEXT NOT NULL       -- JSON, string[][]
  created_at     INTEGER
  updated_at     INTEGER

pipeline_secrets:
  key       TEXT PRIMARY KEY
  value     TEXT NOT NULL            -- AES-256-GCM encrypted
  org_id    TEXT NOT NULL REFERENCES organization(id)
  created_at INTEGER
```

**Event types (mapped from auther's 16 hooks):**

| Group | Events | Mode |
|---|---|---|
| Authentication | `beforeSignup`, `afterSignup`, `beforeSignin`, `afterSignin`, `beforeSignout` | First 3 blocking, last 2 async |
| Token | `beforeTokenIssue` | Blocking |
| OAuth Client | `beforeClientRegister`, `afterClientRegister`, `beforeAuthorize` | First and last blocking, middle async |
| API Key | `beforeApiKeyCreate`, `afterApiKeyCreate` | First blocking, second async |

**Execution modes (matching auther and Auth0):**

| Mode | Return value | Effect |
|---|---|---|
| **Blocking** | `{ allowed: false, error: "reason" }` | Stop the auth flow immediately |
| | `{ allowed: true }` | Continue |
| **Enrichment** | `{ allowed: true, data: { claims: {...} } }` | Continue, merge data into context |
| **Async** | `undefined` or no return | Fire-and-forget, no impact on flow |

### 5.4 DAG Execution Engine

The execution engine is ported directly from auther's `pipeline-engine.ts` with the same semantics:

```ts
// Pipeline Worker — per-request handler
export default {
  async fetch(request, env) {
    const { triggerEvent, context } = await request.json();

    // Load DAG plan from D1
    const plan: string[][] = await loadExecutionPlan(triggerEvent, context.org_id);
    let outputs: Record<string, unknown> = {};

    // Execute layers sequentially
    for (const layer of plan) {
      // Scripts within a layer run in parallel
      const layerResults = await Promise.all(
        layer.map(scriptId => evaluateScript(scriptId, { ...context, outputs }, env))
      );

      // Check for blocking denials
      for (const result of layerResults) {
        if (!result.allowed) {
          return Response.json(result); // Stop, return denial
        }
      }

      // Merge enrichment data into outputs
      outputs = { ...outputs, ...mergeLayerData(layerResults) };
    }

    return Response.json({ allowed: true, data: outputs });
  },
};

async function evaluateScript(scriptId, context, env) {
  const script = await env.DB // D1 binding
    .prepare("SELECT code FROM pipeline_scripts WHERE id = ?")
    .bind(scriptId)
    .first();

  const ctx = QuickJS.newContext();

  // Expose context.* (read-only)
  ctx.setProp(ctx.global, "context", ctx.newObject(context));

  // Expose helpers.*
  ctx.setProp(ctx.global, "helpers", ctx.newObject({
    log: ctx.newFunction("log", (...args) => console.log(...args)),
    now: ctx.newFunction("now", () => Date.now()),
    hash: ctx.newFunction("hash", (text, algo) => { /* crypto.subtle */ }),
    matches: ctx.newFunction("matches", (str, pattern) => new RegExp(pattern).test(str)),
    fetch: ctx.newFunction("fetch", async (url, options) => {
      // SSRF guard: HTTPS-only, block private IPs, timeout 3s, max 1MB
      return safeFetch(url, options);
    }),
    secret: ctx.newFunction("secret", async (key) => {
      return decryptSecret(key, env); // from pipeline_secrets table
    }),
  }));

  const result = ctx.evalCode(script.code, {
    shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + 10_000), // 10s CPU
    memoryLimitBytes: 5 * 1024 * 1024, // 5 MB JS heap
  });

  ctx.dispose();

  if (result.error) {
    // FAIL-OPEN: Script errors do not block the auth flow
    return { allowed: true, error: vm.dump(result.error), _isScriptError: true };
  }
  return vm.dump(result.value);
}
```

**Safety limits (matching auther):**

| Limit | Value | Mechanism |
|---|---|---|
| Script size | 5 KB | Pre-execution check |
| Execution timeout | 10 seconds | `shouldInterruptAfterDeadline` |
| Memory per script | 5 MB | `memoryLimitBytes` on QuickJS context |
| DAG chain depth | 10 layers | Pre-execution validation |
| Max parallel nodes | 5 per layer | Pre-execution validation |
| Fetch timeout | 3 seconds | `AbortController` |
| Fetch response size | 1 MB | Content-Length check + read limit |
| SSRF protection | HTTPS-only, block private IPs | Same guard as auther's `safeFetch` |

**Fail-open design (matching auther):**

If a pipeline script crashes, times out, or exceeds memory, the pipeline **continues** — only an explicit `return { allowed: false }` from the script blocks the auth flow. This is the same fail-open posture as auther and Auth0 (Auth0 terminates hung Actions but does not retroactively deny an already-completed flow).

### 5.5 Example Pipeline Scripts

**Domain blocklist (beforeSignup, blocking):**

```js
const blockedDomains = ["mailinator.com", "tempmail.com", "throwaway.com"];
const domain = context.email.split("@")[1];

if (blockedDomains.includes(domain)) {
  helpers.log("Blocked signup from: " + context.email);
  return { allowed: false, error: "Disposable email domains are not allowed" };
}
return { allowed: true };
```

**Threat intel check (beforeSignin, blocking with async fetch):**

```js
const apiKey = await helpers.secret("THREAT_API_KEY");
const resp = await helpers.fetch("https://api.threatcheck.example/check?email=" + context.email, {
  headers: { "X-API-Key": apiKey }
});

if (resp.status === 200 && resp.json().threat_level === "high") {
  return { allowed: false, error: "Account flagged by security scan" };
}
return { allowed: true };
```

**JWT enrichment (beforeTokenIssue, enrichment):**

```js
return {
  allowed: true,
  data: {
    claims: {
      tenant_id: context.user.organization_id,
      plan: context.user.plan,
      permissions: ["read:invoices", "read:reports"],
    }
  }
};
```

### 5.6 Auth0 Actions Parity

The pipeline design models Auth0 Actions (their pipeline/hook system) deliberately. Auth0 allows **async external API calls in blocking triggers** — their `pre-user-registration` Action docs show `await axios.get(event.secrets.USER_SERVICE_URL)` inside a synchronous hook. The asyncify QuickJS variant enables the same pattern.

| Auth0 Actions | id Pipeline |
|---|---|
| `pre-user-registration` (blocking) | `beforeSignup` |
| `post-login` (blocking, before token) | `beforeSignin`, `beforeTokenIssue` |
| `credentials-exchange` (blocking) | `beforeClientCredentials` |
| `post-user-registration` (async) | `afterSignup` |
| `post-change-password` (async) | `afterPasswordChange` |
| Actions run in sequence per trigger | DAG layers (sequential), scripts per layer (parallel) |
| `api.access.deny(reason, userMessage)` | `return { allowed: false, error: "reason" }` |
| `api.user.setUserMetadata(key, value)` | `return { allowed: true, data: { metadata: {...} } }` |
| `event.user`, `event.client`, `event.request` | `context.user`, `context.client`, `context.request` |
| Actions run in Auth0's Node.js runtime | QuickJS WASM sandbox |
| Actions share tenant context | Isolated Worker — zero access to auth state |

### 5.7 Embedded Scripting Options (Compared)

During design, several embedded scripting approaches were evaluated for in-process (same Worker) pipeline execution:

| | CEL | Starlark (WASM) | Wasmoon (Lua) | QuickJS (JS) |
|---|---|---|---|---|
| Multi-line/statements | No | Yes | Yes | Yes |
| Safe by construction | Yes | Yes | No (needs sandbox) | No (VM = isolation) |
| Sandbox code needed | 0 lines | 0 lines | 30+ lines | 0 lines |
| Syntax | C-like expr | Python | Lua | JS |
| WASM size | — (JS pkg) | ~350 KB | ~1.5 MB | ~880 KB (asyncify) |
| Async I/O (`fetch`) | No (by design) | No (hermetic) | Coroutine hack | Native `await` |
| Workers native | JS import | WASM bundle | WASM bundle | JS + WASM import |
| auther parity | Partial (policy only) | No (no fetch) | Full | Full |

**CEL** and the pipeline are complementary, not alternatives. CEL handles per-token single-expression policy checks (nanoseconds). The pipeline handles multi-step procedural hooks (microseconds + I/O). Together they cover all auther Lua functionality.

**Starlark** (Python dialect, used by Bazel/Caddy) was considered as a safe-by-construction alternative. However, it is strictly hermetic — no network, no clock, no filesystem — by default, and exposing `fetch()` would defeat its safety model. For pure-logic pipeline hooks (no external calls), Starlark is an option to revisit.

**Wasmoon (Lua)** works on Workers (single engine, no pool needed) but ships 1.5 MB of WASM, requires the full auther sandbox layer, and Lua familiarity is a barrier for script authors.

**QuickJS** was chosen as the primary design because:
- JS is the Workers-native language — every developer can write pipeline scripts
- The WASM VM is the isolation boundary — zero sandbox maintenance
- Native async/await for `helpers.fetch()` and `helpers.secret()`
- The asyncify variant adds ~800 KB WASM but removes the need for coroutine hacks
- Per-request overhead is ~0.8ms (context create + eval) — dwarfed by any I/O the script performs
- The auther DAG engine, execution modes, and hook contracts port directly

### 5.8 Alternative — Dynamic Workers

Dynamic Workers (Cloudflare's `worker-loader` binding) remain a documented alternative for organizations that need full JS ecosystem access in pipeline scripts (npm packages, native `fetch`, WebCrypto, KV, R2, Durable Objects).

```
Core Worker                      Dynamic Worker (created at runtime)
┌──────────────┐                 ┌──────────────────────────────────┐
│ BA hooks     │    POST bind    │  Full JS environment             │
│              │ ◄─────────────► │  • npm packages (import)         │
│              │   (HTTP call)   │  • Native Worker APIs            │
└──────────────┘                 │  • Own 128 MB, CPU budget        │
                                 │  • Zero sandbox maintenance      │
                                 └──────────────────────────────────┘
```

**Tradeoff vs QuickJS pipeline Worker:**
- **Cost:** $25/mo for Dynamic Workers. Standard Workers (QuickJS option) are on the free/standard plan.
- **Scale:** QuickJS runs one shared pipeline Worker (auto-scaled by Cloudflare). Dynamic Workers spin per-hook.
- **Isolation:** Both isolate pipeline from auth. Dynamic Workers add per-script isolation (each script = its own Worker) at additional cost.
- **Flexibility:** Dynamic Workers can import any npm package. QuickJS scripts are self-contained (no `require`/`import`, only exposed helpers).

Dynamic Workers remain the right choice if pipeline scripts need arbitrary npm packages or platform APIs beyond what the QuickJS helpers expose. For the vast majority of pipeline use cases (domain checks, threat API calls, JWT enrichment, metadata matching), QuickJS provides everything needed at zero additional platform cost.

## 6. Full Admin UI

### 6.1 Deferred From First Batch

The first batch scaffolds `ui-id` under `/admin/*` with hosted login/consent pages, `/admin/health`, and a `/admin/api` placeholder. Full admin pages and the admin dashboard are deferred.

**Temporary OAuth page scaffold:** `workers/ui/src/main.ts` currently serves raw HTML/CSS/JavaScript for `/login` and `/consent`. This is a first-release browser OAuth testing scaffold only. Phase 7 must replace these routes with proper Vinext App Router pages using `@id/ui` primitives such as `Page`, `Stack`, `Panel`, and `Button`. The replacement pages must live under `workers/ui/src/app/login/` and `workers/ui/src/app/consent/` so the `ui-route-composition` lint rule covers them.

**Architecture note (2026-05-20):** The inline `GET /api/admin/dashboard` endpoint was removed during the Phase 5.7 architecture cleanup (see `002_implementation-sequence.md`). When the dashboard is reimplemented, it must follow the clean-architecture pattern: domain entity/interface, application use case, infrastructure repository (via BA adapter), http route handler with `requireActor(c)`. `app.ts` no longer exists; route registration goes through `composition/create-app.ts` and `http/routes/*.routes.ts`.

**Other deferred architecture layers:**
- `domain/admin/` — empty directory for future Hono-owned domain entities and repository interfaces.
- `application/admin/authorization.ts` — `authorizeAdminAction(actor, action, orgId?)` is implemented and tested but has zero production callers after the dashboard was removed. The four `AdminAction` values (`listAnyOrganization`, `mutateAnyOrganization`, `manageOwnOrganization`, `delegateOwnOrganization`) map to the authorization model from Phase 4 and will be wired in Phase 7 when Hono admin routes call `requireActor(c)` → `authorizeAdminAction(actor, action, orgId)` before use cases.
- `auth/admin/actor.ts` — removed during the plugin-first auth cleanup because it had no production caller. Future Hono-owned admin routes should add actor loading with the request-scoped container work instead of reviving stale code.
- `infrastructure/` — currently no resource-server persistence module. The resource-server audience loader moved to `auth/plugins/resource-server/audiences.ts` because the table is plugin-owned. Future Hono-owned resources will need repositories/mappers under `infrastructure/repositories/`.
- `composition/` — currently only `create-app.ts` with Hono wiring. Phase 7 will add a request-scoped DI container (`create-request-container.ts`) that wires repositories into use cases and sets `c.set('container', container)` via Hono middleware.

### Deferred Admin Code Catalog (Phase 7)

These files exist and are tested but have no production callers. They are preserved as ready-made infrastructure for Phase 7 admin routes.

| File | Export | Purpose | Status |
|---|---|---|---|
| `application/admin/authorization.ts` | `authorizeAdminAction`, `AdminActor`, `AdminAction`, `PlatformRole`, `OrganizationRole` | Server-side authorization decisions per actor+action+org | Tested |
| `auth/admin/actor.ts` | Removed | Future actor loading should be rebuilt with the Phase 7 request-scoped container | Removed |
| `shared/http-status.ts` | `HTTP_UNAUTHORIZED` (401), `HTTP_FORBIDDEN` (403), `HTTP_OK` (200) | Named HTTP status constants | In use by health route |
| `domain/admin/` | (empty) | Future domain entities and repository interfaces | Scaffold only |

**Phase 7 wiring target:**

```ts
// http/routes/admin/dashboard.routes.ts (future)
export function registerAdminRoutes(app: Hono<{ Bindings: CoreEnv; Variables: { container: AppContainer } }>) {
  app.get("/api/admin/dashboard", async (c) => {
    const actor = requireActor(c);            // calls loadAdminActor
    const decision = authorizeAdminAction(actor, "listAnyOrganization");  // checks platform role
    if (!decision.allowed) return c.json({ error: decision.reason }, decision.status);
    const result = await c.var.container.dashboard.summarize.execute();
    return c.json(result, 200);
  });
}
```

**Pages to build:**

| Page | Route | Capabilities |
|---|---|---|
| Dashboard | `/admin` | User/org/client/resource counts, token issuance metrics (from Analytics Engine) |
| Organizations | `/admin/organizations` | List, create, update, delete |
| Organization detail | `/admin/organizations/:id` | Members, invitations, roles, settings |
| OAuth clients | `/admin/clients` | List, create, update, disable |
| OAuth client detail | `/admin/clients/:id` | Redirect URIs, scopes, grants, secret rotation, consent settings |
| Resource servers | `/admin/resource-servers` | List, create, update, disable audiences |
| CEL policies | `/admin/policies` | List, create, update, test CEL policies |
| Users | `/admin/users` | List, view sessions, ban/unban |
| User detail | `/admin/users/:id` | Profile, sessions, org memberships, linked accounts |
| Consents | `/admin/consents` | List, revoke per-user client authorizations |
| Settings | `/admin/settings` | Issuer URL, metadata health, JWKS status, runtime versions |

### 6.2 Lumina UI Contract

All admin pages follow the Lumina UI system from `/home/quanghuy1242/pjs/books/docs/001_lumina_ui_system_daisyui_tailwind.md`:
- Token props, not raw `className`.
- Composition-only route files — no raw HTML, Tailwind, or DaisyUI classes.
- `packages/ui/` components for all visual primitives.
- Compact density, two themes, React Aria at leaf components.

### 6.3 Data Flow

The admin UI calls same-origin `core-id` public API routes directly from browser pages unless a future UI-owned `/admin/api` BFF endpoint needs server-side shaping. No D1 access. No Better Auth instance. Pure presentation.

## 7. Deferred OAuth Browser Pages

The first release should configure only the OAuth pages it actually builds: login and consent. Other Better Auth OAuth Provider browser surfaces are deferred because configured-but-missing pages create dead redirects in production.

Deferred pages and flows:

| Flow | Better Auth option | Future page | Notes |
|---|---|---|---|
| Public sign-up / `prompt=create` | `signup.page` | `/admin/sign-up` or `/sign-up` | Revisit when public or invite-aware self-service registration is intentionally opened. First release disables `emailAndPassword.disableSignUp`. |
| Account selection | `selectAccount.page` | `/admin/select-account` or `/select-account` | Useful only after multi-session/account switching is part of the product. |
| Post-login organization selection | `postLogin.page` | `/admin/select-organization` or `/select-organization` | Revisit when browser clients request org-scoped scopes before an active organization is selected. |
| Password recovery UX | Better Auth password reset callbacks/pages | `/forgot-password`, `/reset-password` | Email delivery is P0, but a polished hosted reset UX can follow if first release handles reset through API/direct links. |

Re-enable each option only in the same change that adds the page and tests the redirect-resume behavior. The tests should prove the page preserves Better Auth's signed OAuth query or continuation parameters and calls the expected Better Auth endpoint before resuming authorization.

## 8. Deferred Admin Authorization Model

A preliminary `AdminActor` / `authorizeAdminAction` RBAC model lived in `workers/core/src/application/admin/authorization.ts` with tests at `workers/core/tests/application/admin-authorization.test.ts`. Both files were removed on 2026-05-21 because the first batch ships with inline `isPlatformAdmin` / `hasOrganizationAccess` checks in Better Auth plugin callbacks.

**What was removed:**

```ts
type PlatformRole = "admin" | "user";
type OrganizationRole = "admin" | "member" | "owner";

type AdminActor = {
  readonly userId: string;
  readonly platformRole: PlatformRole;
  readonly organizations: readonly {
    readonly organizationId: string;
    readonly role: OrganizationRole;
  }[];
};

type AdminAction =
  | "listAnyOrganization"
  | "mutateAnyOrganization"
  | "manageOwnOrganization"
  | "delegateOwnOrganization";

function authorizeAdminAction(
  actor: AdminActor | null,
  action: AdminAction,
  organizationId?: string,
): AuthorizationDecision;
```

**When to reintroduce:**

- When admin endpoints grow beyond CRUD on a single `resourceServer` table and nested authorization patterns (organization-scoped actions with role delegation) need a centralized decision point.
- When the CEL policy engine (Section 2) is ready to replace the imperative `authorizeAdminAction` function.
- When `requireActor(c)` in [admin routes](/workers/core/src/http/routes/admin/) needs more granular action names than "platform admin vs not."

**How to restore:**

1. Copy the types and function from the [git history](https://github.com/) (commit prior to 2026-05-21 deletion).
2. Copy the test suite from the same history.
3. Wire `authorizeAdminAction` into `requireActor` or the use-case layer.
4. Add a snapshot test proving the allowed/denied decision table matches the current release's access rules.

Do not reintroduce the file without also updating `docs/000_repo-architecture.md` if the file placement or layer boundaries change.

## 9. API-First Scope Catalog, Token Claims, And Tooling

`docs/010_organization-teams-oauth-flow.md` defines the target shape for generic `id` capabilities that resource APIs need. The API-first backend work has landed: Better Auth teams are enabled, `idOAuthScopeCatalog` owns resource-server-bound OAuth scopes and M2M org grants, `idPrincipalValidation` owns authenticated exact-ID validation, OAuth routes preload DB-backed scopes, and token issuance adds workspace/direct-share/team claims.

### 9.1 Required API-First Work

The current `idOAuthScopeCatalog` plugin owns:

- `oauthResourceScope` rows: OAuth scopes bound to a specific `resourceServer.id`;
- `oauthClientOrganizationGrant` rows if org-scoped M2M tokens are supported;
- scope preload and invalidation for OAuth authorize/token and OAuth client scope-validation routes;
- generic token issuance checks for audience, scope, organization, team claims, and client eligibility.

The first implementation exposes API/plugin contracts and integration tests. Admin UI pages under `/admin/*` are a later consumer of these endpoints, not a prerequisite for the API/plugin work.

This future work must not add Content IAM to `id`. Product roles, product permissions, role-permission mappings, concrete grants, resource hierarchy/inheritance, final `ContentPolicy.can(...)`, and product policy audit events belong in the resource API.

### 9.2 Scripts And Tooling Reminders

The architecture lint rule `architecture/no-direct-db-access` allowlists raw D1 fallback for approved plugin-owned runtime companions, including:

```text
workers/core/src/auth/plugins/resource-server/audiences.ts
workers/core/src/auth/plugins/oauth-scope-catalog/scopes.ts
workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts
workers/core/src/auth/plugins/oauth-scope-catalog/authorization-context.ts
```

The OAuth scope catalog uses the same plugin-owned preload pattern because `oauthProvider({ scopes })` requires enabled scopes before Better Auth is constructed. Future tooling work should update:

- Any architecture lint fixtures or tests if the repo expands fixture coverage.
- `scripts/auth-api.mjs` and `scripts/auth-api-shared.mjs` only if API smoke helpers are needed before admin UI exists.
- `scripts/remote-smoke.mjs` after scope/team/token endpoints exist, so remote smoke can prove DB-backed scopes participate in OAuth token issuance.

Keep the boundary strict:

- Plugin CRUD must use the Better Auth adapter.
- Raw D1 fallback is allowed only in preload companions that must run before Better Auth exists.
- Do not weaken the rule globally to make policy work pass lint.

### 9.3 Deferred Admin UI

Full admin UI remains part of Section 6. It should not block:

- Better Auth team enablement;
- token claim contracts;
- plugin schemas for resource-server-bound OAuth scopes or M2M org grants;
- DB-backed OAuth scope preload;
- token issuance checks;
- resource API verification guidance;
- architecture script updates.

When the UI work starts, it should call `id` API endpoints for generic teams, OAuth clients, audiences, scopes, and M2M grants. It must not introduce UI-owned D1 access or product policy state inside `id`.

## 10. Identity Events, SCIM Directory, And M2M Principal Contracts (Docs 013-018)

The identity event channel, synchronous principal lookup contract, and M2M / OAuth-client contract are designed across six sibling documents. **Track A (synchronous directory correct) is complete** — docs 017 and 018 are implemented, principal-validation is deleted, content-api ships a SCIM + OAuth picker adapter. **Track B (asynchronous push channel via 014/015/016) is deferred** — no implementation has started; it may be deferred indefinitely until a recorded operational requirement for stale-binding cleanup exists.

### 10.1 The Six Docs

| Doc | Role | Scope | Phases |
|---|---|---|---|
| [013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md) | Standards landscape + decision record | Forever-reference. Standards mapping (SET / SSF / RISC / CAEP / RFC 7662 / OIDC BCL / SCIM), classification per `a.md` taxonomy, M2M TTL and other decisions D1-D8. No implementation. | All phases (decisions) |
| [014_identity-event-producer-id.md](014_identity-event-producer-id.md) | Producer-side implementation plan | `id` only. New `idIdentityEvents` Better Auth plugin. Transactional outbox. SET envelope (RFC 8417). SSF stream-config endpoints. Cloudflare Queues delivery with retry/DLQ. | **Deferred** (Track B not started) |
| [015_identity-event-consumer-content-api-audit.md](015_identity-event-consumer-content-api-audit.md) | Consumer-side audit-mode plan | `content-api` only. SET receiver, JWS verification, idempotency on `jti`, reconciliation findings table, operator read API. **No** change to `ContentPolicy.can()`. | **Deferred** (Track B not started) |
| [016_identity-event-consumer-content-api-fence-enforcement.md](016_identity-event-consumer-content-api-fence-enforcement.md) | Consumer-side fence enforcement plan, conditional | `content-api` only. `iat`-based fence table, denial in token-principal expansion, operator override endpoints, delivery-bound revocation SLA. | **Deferred** (gated on 015 + D5 trigger) |
| [017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md) | Synchronous SCIM directory contract | `id` and `content-api`. Replaces custom user/team/admin principal-validation with read-only SCIM v2. | **Implemented** (2026-05-27 — Track A4) |
| [018_m2m-oauth-client-org-binding.md](018_m2m-oauth-client-org-binding.md) | **Canonical** M2M / OAuth-client contract | `id` and `content-api`. Adopts BA's `clientReference`, `clientPrivileges`, RFC 7591/7592-shaped endpoints, and native `client_credentials`. Replaces `oauthClientOrganizationGrant` with `oauthClientResourceScope`. | **Implemented** (2026-05-26 — Track A2) |

### 10.2 Reading Order

For someone new to the design:

1. **Read [013](013_identity-event-standards-and-decisions.md) first**. It defines the standards landscape, the decisions, and the phased plan. Without it, the other docs lack the "why."
2. **Track A (017 + 018) is implemented** — synchronous SCIM directory + OAuth client picker are live in both `id` and `content-api`. No further action needed.
3. **Track B (014 + 015 + 016) is deferred** — the asynchronous push channel (SET/SSF/RISC events) has not been implemented. No consumer exists yet. These docs can be reviewed for context but are not required for current operations. Implementation may begin only when a recorded operational requirement for stale-binding cleanup exists.

For someone reviewing a change set against this plan: event-channel changes reference doc 013 by decision ID (D1-D8) then 014/015/016 §N for execution. Synchronous user/team/admin directory changes reference doc 017. Anything touching OAuth clients, service accounts, the grant table, or M2M token issuance references doc 018 by decision ID (018 D1-D6).

### 10.3 Current Status

**Track A (synchronous): complete.** SCIM directory + OAuth picker replacing principal-validation is shipped in both `id` (A3, A5) and `content-api` (A4). Docs 017 + 018 are implemented. No further synchronous work.

**Track B (asynchronous push channel): deferred.** None of 014/015/016 have been implemented. The following phase diagram is retained as the planned design if and when Track B is started:

```text
                  Phase 1                Phase 2                Phase 3
                  ───────                ───────                ───────
                  SET+SSF+RISC           + CAEP vocab           Fence enforcement
                  Audit only             Audit only             Active denial

id producer       Doc 014 main           Doc 014 §8             (no change)
(this repo)       (RISC events,          (CAEP events added
                   outbox, delivery)      to same producer)

content-api       Doc 015 main           Doc 015 §8             Doc 016 entire doc
consumer          (receiver, findings,   (CAEP audit handlers,  (iat contract,
                   no policy change)      no policy change)      fence table, denial)

Gate to advance   ships first            D4 trigger             D5 trigger
                  (Phase 1 standard)     (M2M revocation        (audit insufficient,
                                          requirement)           operational evidence)
```

### 10.4 Doc 012 (`012_random_thoughts.md`)

Doc 012 is **superseded** by docs 013-018 for any new implementation work. It is retained as historical context. The standards-boundary discipline and staging instincts from 012 are carried forward; its invented event vocabulary (`identity.user.disabled.v1` etc.) is rejected in favor of standard RISC/CAEP URIs, with narrowly-scoped repo-specific URIs explicitly classified in [013 §7](013_identity-event-standards-and-decisions.md#7-event-vocabulary-mapping). Its custom synchronous validation posture is superseded by doc 017's read-only SCIM proposal and doc 018's BA-aligned OAuth-client contract.

### 10.5 What These Docs Do Not Cover

- OIDC Back-Channel Logout (browser RP session termination) — [013 D7](013_identity-event-standards-and-decisions.md#57-d7--oidc-back-channel-logout-is-out-of-scope) records this as out of scope.
- Full SCIM 2.0 provisioning — [013 D8](013_identity-event-standards-and-decisions.md#58-d8--scim-readquery-is-separate-from-full-provisioning) keeps create/update/delete provisioning out of scope. Read-only SCIM directory lookup is proposed in [017](017_scim-directory-and-m2m-principal-contract.md).
- Cross-organization OAuth clients — [018 §11](018_m2m-oauth-client-org-binding.md#11-future-backlog) records this as out of scope until a concrete product requirement appears.
- SCIM service-account ResourceType — out of scope per [018 D6](018_m2m-oauth-client-org-binding.md#56-d6---no-scim-service-account-resource-type).
- Per-route RFC 7662 introspection — [013 D6](013_identity-event-standards-and-decisions.md#56-d6--rfc-7662-introspection-is-deferred) defers this; the endpoint exists today and is available as a per-route option when a specific high-risk route requires sub-token-expiry status checks.
- Public user-managed webhook subscriptions (the legacy `auther` model) — out of scope. Operator-provisioned subscriptions only.

## 11. Design System Specification Format

> Status: brainstorming — options under evaluation
>
> Date: 2026-05-26

The admin UI (Section 6) needs a machine-readable specification that defines three layers: **design tokens** (colors, spacing, typography), **component registry** (props, variants, states, token bindings, accessibility), and **screen/page registry** (layout composition, data dependencies, auth gates). This section surveys options for each layer and recommends a composition approach.

### 11.1 Requirements

A design system specification must be:
- **Structured** — every section has a defined shape. Consumers know what to expect.
- **Machine-readable** — JSON or JSON Schema, validated at build time, parseable by tools and AI agents.
- **Versioned** — tokens, components, and screens evolve; old versions must remain parseable.
- **Portable** — decoupled from any specific tool or platform. Works with both React (admin UI) and plain HTML/CSS (login/consent pages).
- **Extensible** — custom metadata can be added without breaking the format.
- **Composable** — tokens reference each other; components reference tokens; screens reference components.

### 11.2 Three Layers

The design system specification must cover three layers. No single existing standard covers all three.

| Layer | Question answered | Existing standard? |
|---|---|---|
| **Design tokens** | What colors, spacing, typography, radii, shadows exist? | Yes — W3C DTCG v1 (2025.10) |
| **Component registry** | What components exist? Props, variants, states, sizes? Token bindings? Accessibility? | No standard exists |
| **Screen/page registry** | What pages exist? What components compose them? Data dependencies? Auth gates? | No standard exists |

### 11.3 Token Layer — W3C DTCG (Adopt)

**Decision:** Use DTCG. No alternatives considered — it is the industry standard.

The W3C Design Tokens Community Group published stable v1 (2025.10). It defines a JSON format with `$type`/`$value` properties, `$ref` for aliases, group-level type inheritance, and a resolver module for theming (light/dark, brand variants). Backed by Figma, Tokens Studio, Sketch, Penpot, Terrazzo, Style Dictionary, and 10+ tools.

**Supported types:** `color` (14 color spaces including oklch, display-p3), `dimension` (px/rem), `fontFamily`, `fontWeight`, `duration` (ms/s), `cubicBezier`, `number`, `strokeStyle`, `typography` (composite), `shadow` (composite), `gradient` (composite), `border` (composite), `transition` (composite).

**Theming via resolver:**

```json
{
  "version": "2025.10",
  "sets": {
    "primitives": { "sources": [{ "color": { "blue": { ... } }, "spacing": { ... } }] },
    "semantic": { "sources": [{ "color": { "action": { "primary": { "$value": "{color.blue.500}" } } } }] }
  },
  "modifiers": {
    "theme": {
      "default": "light",
      "contexts": {
        "light": [{ "surface": { "bg": { "$value": "{color.neutral.white}" } } }],
        "dark": [{ "surface": { "bg": { "$value": "{color.neutral.black}" } } }]
      }
    }
  },
  "resolutionOrder": [{ "$ref": "#/sets/primitives" }, { "$ref": "#/sets/semantic" }, { "$ref": "#/modifiers/theme" }]
}
```

**Tooling available:**
- `@paths.design/w3c-tokens-validator` — JSON Schema validation
- `dispersa` — TypeScript build system, resolves → CSS/JSON/JS/TS output
- `@canonical/terrazzo-plugin-css` — CSS custom property generation
- `dtcg-validator` — web-based validator (109 tests)

### 11.4 Component Registry Options

No standard exists. Six formats were evaluated:

#### 11.4.1 DSS — Design System Spec (Go/JSON, 9 layers)

- **Repo:** `plexusone/design-system-spec`
- **Format:** Go structs → JSON Schema. 9 canonical layers: Meta, Principles, Foundations (tokens), Components, Patterns, Templates, Content, Accessibility, Governance.
- **Strengths:** Most comprehensive. Explicit component variants, states, props, slots. LLM-optimized with `intent`, `allowedContexts`, `forbiddenContexts`, `antiPatterns` per component. Generates JSON Schema for validation.
- **Weaknesses:** Go-first — Go structs are source of truth, JSON Schema is generated. Not JS-native. 9 layers is overkill for admin UI alone. Small community.
- **Verdict:** Too heavy. Wrong language ecosystem.

#### 11.4.2 DSDS — Design System Documentation Schema (JSON Schema)

- **Repo:** `somerandomdude/design-system-documentation-schema`
- **Format:** JSON Schema. Six entity kinds: `component`, `token`, `token-group`, `theme`, `style`, `pattern`. Uses a unified `documentBlocks` array with `kind` discriminators for anatomy, API specs, variants, states, design specifications, accessibility, content.
- **Strengths:** Works alongside DTCG (DTCG for values, DSDS for docs). Structured. Machine-readable. Covers variants, states, design properties as token names or raw values. Explicit `source` property links tokens back to DTCG definitions.
- **Weaknesses:** Documentation-oriented — describes how components *should* work rather than defining a code contract. No runtime validation of component props. Document blocks are descriptive, not prescriptive. Small community (one maintainer).
- **Verdict:** Good structure to learn from. Too documentation-focused — we need a code contract, not a documentation schema.

#### 11.4.3 shadcn/ui Registry (`registry.json`)

- **Repo:** `shadcn-ui/ui`
- **Format:** JSON with Zod validation. Items have `type` (`registry:ui`, `registry:block`, `registry:style`, `registry:theme`, `registry:page`), `files`, `dependencies`, `registryDependencies`, `cssVars`, `css`, `meta`.
- **Strengths:** Powers the most popular React component ecosystem. Simple. Well-proven at scale. CLI-driven install. Good metadata model.
- **Weaknesses:** Thin — no prop schemas, no variant definitions, no state matrices, no token bindings beyond cssVars. Designed for distribution/CLI install, not for design specs. Items are files on disk, not abstract component definitions.
- **Verdict:** Good reference for the registry-as-package model. Not a design specification format.

#### 11.4.4 PatternFly Component Schemas (JSON Schema + Zod per component)

- **Repo:** `patternfly/patternfly-component-schemas`
- **Format:** `schema.json` + `schema.zod.ts` per component (462 total). Generated from `component-metadata.json`. Each component: `componentName`, `props` array with `name`, `type`, `required`, `default`, `description`.
- **Strengths:** Battle-tested at scale. 462 components, 3,487 props. Dual JSON Schema + Zod. AI/LLM consumption via MCP. Tree-shakeable. Lazy loading for bulk access. Draft 2020-12 JSON Schema.
- **Weaknesses:** Props only. No variants, states, token bindings, sizes, accessibility, or anti-patterns. The `component-metadata.json` format is ad-hoc — no shared spec, just internal tooling output.
- **Verdict:** Proves the "schema per component" model works at scale. Needs extension with variant/state/token metadata.

#### 11.4.5 Prototyper UI Catalog (Zod → JSON Schema + system prompt)

- **Repo:** `prototyper-ui` (Prototyper UI)
- **Format:** `.catalog.ts` files with `defineComponent()` → `defineCatalog()`. Each component: Zod schema for props, `events` array, `slots` array, `description`, `example`. Catalog generates JSON Schema and LLM system prompts.
- **Strengths:** Zod-native — props are validated at runtime. Dual output: JSON Schema for tooling, system prompt for AI agents. Event and slot declarations. LLM-oriented with usage descriptions.
- **Weaknesses:** No variants, states, sizes. No token bindings. Focused on AI-generated UI (Prototyper renderer), not human-authored component specs.
- **Verdict:** The Zod-first pattern (define → generate schema) is the right approach. The catalog concept is clean. Needs extension for variant/state/token metadata.

#### 11.4.6 SDUI Contract Pattern (Server-Driven UI)

- **Format:** `{ "schema_version": "2.4", "screen": { "id": "...", "components": [{ "type": "hero_card", "version": 2, "props": {...} }] } }`. Each component carries `type` + `version` for client-side resolution. Actions use URI schemes (`navigate://`, `api://`). Typed component registries on client map (type, version) → renderer.
- **Strengths:** Production-proven at scale (mobile apps with sub-hour UI deploys). Version negotiation between client and server. Graceful degradation for unknown components.
- **Weaknesses:** Runtime contract, not design-time spec. No token layer. No variant/state definitions — just props. Designed for mobile native (Compose/SwiftUI), not web admin UI.
- **Verdict:** The versioned contract + typed registry pattern is directly applicable. The (type, version) → renderer mapping is clean. The spec content is too thin.

### 11.5 Recommended Approach — Custom Schema Composed from Proven Patterns

No single existing format covers all three layers satisfactorily. The recommendation is a custom JSON schema suite in `packages/design/` that composes proven patterns:

| Concern | Adopted from | Format |
|---|---|---|
| Design tokens | W3C DTCG 2025.10 | `.tokens.json` (DTCG format) |
| Theme resolver (light/dark) | DTCG Resolver module | `.resolver.json` |
| Component props/validation | PatternFly + Prototyper | Zod schema per component |
| Component variants/states/tokens | DSS (concepts) + DSDS (structure) | Custom JSON per component |
| Screen layout composition | SDUI contracts | Custom JSON per screen |
| AI agent context | Prototyper + Claude Skills | Generated `.md` from tokens + components + screens |

**File layout:**

```
packages/design/
  schemas/
    component.schema.json          # JSON Schema for component specs
    screen.schema.json             # JSON Schema for screen specs
    registry.schema.json           # JSON Schema for the component registry index
  tokens/
    primitives.colors.tokens.json    # DTCG — raw palette
    primitives.spacing.tokens.json   # DTCG — spacing scale
    primitives.typography.tokens.json # DTCG — type scale
    primitives.radii.tokens.json     # DTCG — corner radii
    semantic.tokens.json             # DTCG — semantic aliases over primitives
    themes.resolver.json             # DTCG — light/dark resolver
  components/
    index.json                       # Registry index — lists all components
    button.json                      # Component spec
    card.json
    input.json
    stack.json
    panel.json
    dialog.json
    ...
  screens/
    admin-dashboard.json             # Screen spec
    admin-organizations.json
    admin-clients.json
    ...
  generated/
    tokens.css                       # CSS custom properties (from DTCG)
    tokens.ts                        # TypeScript token map
    ai-context.md                    # Claude/Cursor/Copilot context file
```

**Build pipeline:**

```
tokens/*.tokens.json ──────────────────────────────────────────► tokens.css, tokens.ts
                               (dispersa / custom resolver)

components/index.json + components/*.json ──► zod schemas ──► runtime validation
                                              │
                                              └──────────────► ai-context.md (with tokens + screens)

screens/*.json ──► layout contract ──► admin UI routes + data fetching
```

### 11.6 Decision Status

| Decision | Status | Rationale |
|---|---|---|
| Token format: W3C DTCG 2025.10 | **Decided** | Industry standard. Tooling exists. No alternative merits consideration. |
| Component spec: custom JSON Schema | **Tentative** | No existing standard covers variants + states + token bindings + accessibility. DSS and DSDS provided reference shapes; the custom schema composes them into a code contract. |
| Screen spec: custom JSON Schema | **Tentative** | SDUI contracts are the closest prior art. A custom schema that declares layout composition (component tree), data dependencies, auth gates, and route metadata. |
| Registry index: custom JSON Schema | **Tentative** | shadcn's `registry.json` model (flat list with names, types, files) is a clean starting point. Extended with Zod validation at build time. |
| Generation target: CSS vars + TS types + AI context | **Tentative** | Three consumers — browser, TypeScript, AI agent — derived from the same source of truth. |

### 11.7 Open Questions

- Should component specs use DTCG's `$ref` syntax for token bindings (e.g., `"{color.action.primary}"`) or a custom reference format? DTCG `$ref` requires JSON Pointer paths which are verbose for cross-file references.
- Should the JSON Schema for components be a single-file schema (like PatternFly's) or per-component files? Per-component is easier to author and review; single-file is easier to validate in bulk.
- Should component specs include visual regression test references (screenshot hashes, Storybook URLs) for automated drift detection?
- Should the component registry include a concept of "primitive" mapping (e.g., this Button uses `react-aria/Button` internally) for AI code generation that needs to import the correct base component?
- Are screen specs needed at all, or should admin UI pages be free-form composition? If specs exist, they serve as documentation and AI context but should not constrain the implementation at runtime.

### 11.8 Screen Layout Specification — ASCII + Pseudo-Code

JSON trees are impractical for screen composition. A moderately complex screen (detail page with tabs, columns, cards within cards, conditional rendering) would produce 300+ lines of deeply nested JSON — unreadable, unreviewable, write-only.

The preferred format combines two representations, each serving a different need:

| Representation | Purpose | Example |
|---|---|---|
| **ASCII mockup** | Visual layout at a glance — "where things are" | Sidebar left, PageHeader top, two-column body |
| **Pseudo-code composition** | Component tree — "what things are" | `Page → Tabs → Panel → Stack → DataTable` |
| **State table** | Edge cases — loading, empty, error | `Loading → Skeleton rows, Empty → Message + CTA` |
| **Data sources** | API contracts | `GET /api/auth/oauth2/get-clients → { clients, total }` |

**Example — Applications List screen:**

**ASCII:**

```
+-- Topbar -------------------------------------------------------+
| [=] id admin     [org: Acme Corp v]               [@ admin   ]  |
+-- Sidebar ----------+ +-- Content ------------------------------+
|                     | |                                          |
| Identity            | | +-- PageHeader ----------------------+  |
|   Users             | | | Applications                        |  |
|   Organizations     | | | [Org filter v] [Search...] [+ New]  |  |
|                     | | +-----------------------------------+  |
| OAuth >             | |                                     |  |
|   Applications      | | +-- Panel: Table -------------------+  |
|   Resource APIs     | | |  Name      | Type  | Org  | Scopes |  |
|   M2M Bindings      | | |  Content.. | M2M   | Acme | 3      |  |
|   Sessions/Tokens   | | |  Web App   | AuthZ | Beta | 1      |  |
|                     | | |  [< Prev]       Page 1/3    [Next>]|  |
| Security            | | +====================================+  |
|   JWKS / Keys       | | | 2 selected  [Disable] [Delete]     |  |
+---------------------+ +-----------------------------------------+
```

**Pseudo-code:**

```text
Page(layout="dashboard", bg="base-200")
  PageHeader(border-b, py-4, px-6, bg="base-100")
    Container(width="wide")
      Inline(justify="between", align="center")
        Stack(gap="xs")
          Text(variant="h1") "Applications"
          Text(variant="caption", tone="muted") "Manage OAuth clients and service accounts"
        Inline(gap="sm", align="center")
          FilterDropdown(label="Organization", options=orgs, value=selectedOrgId)
          SearchInput(placeholder="Search by name or client ID...", debounceMs=300)
          LinkButton(variant="primary", size="sm") "+ New Application"

  PageBody(padding="md")
    Container(width="wide")
      Panel(padding="none", tone="base", shadow="sm", border)
        DataTable(
          columns=[
            {key: "name", label: "Name", sortable: true, render: nameBadge}
            {key: "grantType", label: "Type", render: Badge("M2M"|"User Auth")}
            {key: "orgName", label: "Organization", hideWhen: actorIsOrgAdmin}
            {key: "scopeCount", label: "Scopes"}
          ]
          rows=applications, page=page, totalPages=3
          onPageChange=setPage
          selectedIds=selected, onSelectionChange=setSelected
          emptyMessage="No applications found."
        )
      BulkActions(visible=selected.length > 0)
        Badge(tone="neutral") "{n} selected"
        Button(variant="danger", size="sm") "Delete"
```

**States:**

| State | Render |
|---|---|
| Loading | Skeleton rows × 5, pagination hidden |
| Empty (no apps) | Stack with Text "No applications." + LinkButton "Create one" |
| Empty (search) | Text "No results" + Button "Clear search" |
| Error | Alert(tone="error") "Failed to load." + Button "Retry" |

**Data source:** `GET /api/auth/oauth2/get-clients` returns `{ clients: [...], total }`

**Why this works:**
- The ASCII is **scannable** — you see the whole screen shape instantly, no parsing required
- The pseudo-code is **implementable** — every line maps directly to a component with known props
- The format is **syntax-light** — no JSON quoting, no brackets, just indentation and function calls
- It is **parsable** — the pseudo-code can be tokenized into a machine-readable AST if automated validation or AI context generation is needed later
- It lives in the repo next to the code it describes — a single `docs/screens/applications-list.md` is the complete specification

The component layer still benefits from JSON schemas (Section 11.5) — defining what props `DataTable`, `Panel`, `Badge` accept, what variants exist, what tokens they bind to. But screen composition belongs in this hybrid format.
