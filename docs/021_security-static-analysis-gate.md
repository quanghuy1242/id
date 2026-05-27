# 021 — Security Static Analysis Gate (Option B)

> Status: implementation-grade proposal
>
> Date: 2026-05-27
>
> Scope:
>
> - `.oxlintrc.json`
> - `scripts/oxlint-js-plugins/security.js` (new)
> - `.semgrep.yml` (new)
> - `package.json` — `check` and `check:security` scripts
>
> Source docs:
>
> - `docs/security/security-register.md`
> - `docs/security/20260527_0001_workers-security-findings.md`
>
> Related docs:
>
> - `docs/000_repo-architecture.md`
>
> Assumptions:
>
> - `semgrep` CLI is available in the dev environment and CI; it is installed separately from pnpm (not an npm package).
> - The gate covers the two findings that are reliably statically catchable now: SEC-001 and SEC-004. Remaining findings require architectural fixes, not scanners.
> - The oxlint `jsPlugins` custom rule API is the same interface used by `scripts/oxlint-js-plugins/architecture.js`.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Current-State Findings](#2-current-state-findings)
  - [2.1 Lint Toolchain Today](#21-lint-toolchain-today)
  - [2.2 The Two Unguarded Patterns](#22-the-two-unguarded-patterns)
- [3. Architecture Decisions](#3-architecture-decisions)
  - [3.1 Recommended Option B](#31-recommended-option-b)
  - [3.2 Rejected Options](#32-rejected-options)
  - [3.3 The No-Auto-Scan Discipline](#33-the-no-auto-scan-discipline)
- [4. Target Model](#4-target-model)
- [5. Implementation Plan](#5-implementation-plan)
  - [5.1 Enable oxlint Built-In Security Category](#51-enable-oxlint-built-in-security-category)
  - [5.2 Custom oxlint jsPlugin — SEC-001 Timing-Unsafe Comparison](#52-custom-oxlint-jsplugin--sec-001-timing-unsafe-comparison)
  - [5.3 Semgrep Rule — SEC-004 JWT Algorithm Pinning](#53-semgrep-rule--sec-004-jwt-algorithm-pinning)
  - [5.4 Wire Into pnpm check](#54-wire-into-pnpm-check)
- [6. Edge Cases And Failure Modes](#6-edge-cases-and-failure-modes)
- [7. Definition Of Done](#7-definition-of-done)
- [8. Final Model](#8-final-model)

## 1. Goal

Add a zero-false-positive static security gate to `pnpm check` that prevents two confirmed high-value regressions from re-entering the codebase after they are fixed:

- **SEC-001** — bearer token compared with `!==` instead of `timingSafeEqual`
- **SEC-004** — `jwtVerify` called without an `algorithms` allowlist

Non-goals for this document:

- Addressing all 18 findings in `docs/security/security-register.md` — most require architectural fixes, not scanners.
- Running a broad SAST scan (`semgrep --config auto`, CodeQL, Snyk). Those produce noise that degrades gate trust.
- Adding runtime or dependency-vulnerability scanning — `pnpm advise` already surfaces CVEs.

## 2. Current-State Findings

### 2.1 Lint Toolchain Today

`pnpm check` runs: `pnpm lint && pnpm check:dup && pnpm typecheck && pnpm test`

`pnpm lint` invokes oxlint with `.oxlintrc.json`:

- **Plugins** (built-in reimplementations): `typescript`, `unicorn`, `oxc`, `vitest`, `import`, `promise`
- **jsPlugins** (custom JS AST rules): `scripts/oxlint-js-plugins/architecture.js`
- **Categories enabled**: `correctness: error`, `suspicious: error`, `perf: warn`
- **`security` category**: not present — the built-in security rules are entirely disabled

No Semgrep configuration exists. The repo has no `.semgrep.yml` and `semgrep` is not referenced in any script.

### 2.2 The Two Unguarded Patterns

**SEC-001** — `workers/core/src/http/routes/bootstrap.routes.ts:41`

```ts
if (bearerToken(c.req.header("authorization") ?? null) !== expectedToken) {
```

JavaScript `!==` short-circuits on the first mismatched byte. An attacker issuing requests to `/api/bootstrap/admin` before the first admin is created can in principle recover `ID_BOOTSTRAP_TOKEN` via timing side-channel. The fix (`timingSafeEqual`) is one line. The regression risk — a future refactor reintroducing `!==` — is real and not currently caught by any tool.

**SEC-004** — `workers/core/src/auth/verify-scoped-bearer.ts:50`

```ts
({ payload } = await jwtVerify(token, cryptoKey, {
  issuer: params.issuer,
  audience: params.audience,
}));
```

`jwtVerify` is called without `algorithms`. The algorithm falls back to whatever the token's `alg` header claims. `jose` provides partial defense via key-type checking, but the explicit `algorithms` allowlist is the standard defense against alg-confusion attacks (RFC 8725). This is the single JWT verification path for all system-audienced endpoints — `principal-validation` and `oauth-client-picker` both route through `verifyScopedBearerToken`. A future regression here has the largest blast radius of any finding in this codebase.

## 3. Architecture Decisions

### 3.1 Recommended Option B

Two tools, narrow scope:

| Layer | Tool | What it catches | Gate type |
|---|---|---|---|
| oxlint built-in | `"security": "warn"` in categories | `no-unsafe-regex` and other built-in security rules | Hard (pnpm lint) |
| oxlint jsPlugin | `scripts/oxlint-js-plugins/security.js` | SEC-001 timing-unsafe bearer comparison | Hard (pnpm lint) |
| Semgrep | `.semgrep.yml` with one curated rule | SEC-004 missing JWT algorithm pin | Hard (pnpm check:security) |

The gate is zero-noise by design: every rule that enters `.oxlintrc.json` or `.semgrep.yml` must have a zero false-positive record on the current codebase before it is merged.

### 3.2 Rejected Options

**Extending oxlint jsPlugin for SEC-004 instead of Semgrep**

The jose `jwtVerify` options-object check is well-modeled in Semgrep's pattern language (`pattern-not` with spread metavariables). Writing the same thing as an oxlint JS AST rule requires traversing into nested object argument properties manually — more code, same result. More importantly, Semgrep has a community rule for this exact pattern (`javascript.jose.security.audit`) that is tested against real codebases. Rewriting it in the custom plugin foregoes that validation.

**Running `eslint-plugin-security` alongside oxlint**

oxlint's `plugins` field is not ESLint plugin-compatible — it lists oxlint's own built-in reimplementations. Running `eslint-plugin-security` would require a separate ESLint invocation with its own config. That adds a second lint tool, a second config to maintain, and `eslint-plugin-security`'s `detect-object-injection` rule fires on every `obj[key]` pattern — a notorious source of noise that would immediately degrade gate trust.

**CodeQL**

Provides taint analysis that could catch SEC-012 (consent spoofing via URL params) and SEC-014 (open redirect). However, CodeQL requires GitHub Advanced Security (paid for private repos), runs in minutes rather than seconds, and uses a bespoke query language. The two findings it would add coverage for have architectural fixes already identified. Not worth the operational cost.

**Semgrep with `--config auto` or `--config p/typescript`**

`--config auto` pulls thousands of community rules and routinely flags 40+ findings on a TypeScript codebase, a large fraction of which are false positives for a Cloudflare Workers context. The resulting gate noise causes developers to disable the check or bulk-suppress findings. `--config p/typescript` is the same problem at smaller scale. The only safe Semgrep mode for a hard gate is a hand-curated `.semgrep.yml` under version control.

### 3.3 The No-Auto-Scan Discipline

The `.semgrep.yml` is the source of truth for which Semgrep rules run in the gate. The following commands must not appear in `package.json`, CI, or pre-commit hooks without explicit per-rule review:

```
semgrep --config auto
semgrep --config p/<any-ruleset>
semgrep --config r/<any-registry-rule-not-in-.semgrep.yml>
```

Adding a new rule to the gate requires: running it locally against the full codebase, confirming zero false positives, reviewing what it catches, and committing the rule to `.semgrep.yml` with a `metadata.finding` annotation linking it to the register.

## 4. Target Model

After implementation, `pnpm check` runs:

```
pnpm lint         → oxlint (architecture gate + security category + security.js jsPlugin)
pnpm check:dup    → Fallow duplicate gate
pnpm check:security → semgrep --config .semgrep.yml --error (SEC-004)
pnpm typecheck    → strict TypeScript
pnpm test         → Vitest workspace
```

`pnpm lint` is unchanged in invocation — the new security rules are additive. `pnpm check:security` is a new script added to `package.json`.

The two findings are covered as follows:

| Finding | Tool | Rule ID | Trigger |
|---|---|---|---|
| SEC-001 | oxlint jsPlugin | `security/timing-unsafe-bearer-comparison` | `!==` or `===` with a bearer/secret-named call |
| SEC-004 | Semgrep | `jose-jwtverify-missing-algorithms` | `jwtVerify(...)` without `algorithms` key in options |

## 5. Implementation Plan

### 5.1 Enable oxlint Built-In Security Category

**Current problem**: `.oxlintrc.json` has `correctness`, `suspicious`, and `perf` under `categories`, but not `security`. Built-in security rules including `security/no-unsafe-regex` (ReDoS detection) are never evaluated.

**Target behavior**: All built-in oxlint security rules run and report as warnings. Any that prove noisy on the current codebase are explicitly turned off by rule name, not by removing the category.

**Implementation tasks**:

- [ ] Add `"security": "warn"` to the `categories` object in `.oxlintrc.json`.
- [ ] Run `pnpm lint` and review any new findings.
- [ ] For any finding that is a confirmed false positive for this codebase, add a targeted `"off"` override under `rules` with a comment, not a category-level removal.

**Tests**:

- `pnpm lint` must exit 0 on the current codebase after changes.

---

### 5.2 Custom oxlint jsPlugin — SEC-001 Timing-Unsafe Comparison

**Current problem**: `bootstrap.routes.ts:41` uses `!==` to compare the output of `bearerToken(...)` against `expectedToken`. No existing rule flags this pattern. After the fix lands (replacing with `timingSafeEqual`), there is nothing preventing a future contributor from re-introducing the same `!==` comparison.

**Target behavior**: Any `===` or `!==` binary expression where one operand is a call to a function whose name matches `/bearer|secret|hmac|hash/i` and the other operand is not a null/undefined/boolean literal is flagged as an error.

**Rule shape** — `scripts/oxlint-js-plugins/security.js`:

```js
var SECRET_CALL_PATTERN = /bearer|secret|hmac|hash/i;

var timingUnsafeBearerComparisonRule = {
  meta: {
    type: "problem",
    docs: { description: "Use timingSafeEqual for bearer token and secret comparisons" },
    schema: [],
  },
  create: function (context) {
    function calleeName(node) {
      if (node.type === "Identifier") return node.name;
      if (node.type === "MemberExpression" && node.property.type === "Identifier")
        return node.property.name;
      return null;
    }
    function isSecretCall(node) {
      if (node.type !== "CallExpression") return false;
      var name = calleeName(node.callee);
      return name !== null && SECRET_CALL_PATTERN.test(name);
    }
    function isTrustedLiteral(node) {
      if (node.type !== "Literal") return false;
      return node.value === null || node.value === undefined ||
             typeof node.value === "boolean";
    }
    return {
      BinaryExpression: function (node) {
        if (node.operator !== "===" && node.operator !== "!==") return;
        var left = node.left;
        var right = node.right;
        if (isSecretCall(left) && !isTrustedLiteral(right)) {
          context.report({ node: node, message: "Timing-unsafe comparison of a secret/bearer value. Use node:crypto timingSafeEqual instead." });
        } else if (isSecretCall(right) && !isTrustedLiteral(left)) {
          context.report({ node: node, message: "Timing-unsafe comparison of a secret/bearer value. Use node:crypto timingSafeEqual instead." });
        }
      },
    };
  },
};
```

**Why `isTrustedLiteral` excludes null/undefined/boolean**: `if (bearerToken(...) !== null)` is a presence check, not a secret comparison — it must not be flagged. The rule targets comparisons against dynamic values where timing leaks the secret content.

**Plugin registration** follows the same pattern as `architecture.js`: export a `rules` object and a `meta` block, then wire the rule name into `.oxlintrc.json` under `rules`.

**Implementation tasks**:

- [ ] Create `scripts/oxlint-js-plugins/security.js` with the rule above.
- [ ] Add `"./scripts/oxlint-js-plugins/security.js"` to the `jsPlugins` array in `.oxlintrc.json` (alongside the existing architecture plugin entry).
- [ ] Add `"security/timing-unsafe-bearer-comparison": "error"` to the `rules` object in `.oxlintrc.json`.
- [ ] Run `pnpm lint` and confirm the rule fires on `bootstrap.routes.ts:41` before the SEC-001 fix and passes after.
- [ ] Add the `scripts/oxlint-js-plugins/security.js` path to the `ignorePatterns` exclusions if needed (architecture.js is already excluded from lint scanning).

**Tests**:

- `pnpm lint` must report `security/timing-unsafe-bearer-comparison` on the current `bootstrap.routes.ts:41` line.
- After applying the `timingSafeEqual` fix, `pnpm lint` must pass clean.

---

### 5.3 Semgrep Rule — SEC-004 JWT Algorithm Pinning

**Current problem**: `verify-scoped-bearer.ts:50` calls `jwtVerify` without `algorithms`. The community Semgrep rule `javascript.jose.security.audit.jwt-verify-algorithm-not-pinned` (or equivalent in the `p/javascript` pack) targets exactly this pattern, but no Semgrep configuration exists in the repo.

**Target behavior**: Any call to `jwtVerify(token, key, options)` where the `options` object does not include an `algorithms` key is flagged as an error in `pnpm check:security`.

**`.semgrep.yml`** at the repo root:

```yaml
# Curated security rules for this repository.
# Do not add rules from --config auto or --config p/* without per-rule review.
# Each rule must have a zero false-positive record on the current codebase.
# Link every rule to its finding in docs/security/security-register.md.

rules:
  - id: jose-jwtverify-missing-algorithms
    message: >
      jwtVerify called without an algorithms allowlist. Pin the expected algorithm
      to prevent alg-confusion attacks. See docs/security/security-register.md SEC-004
      and docs/security/20260527_0001_workers-security-findings.md §SEC-004.
    languages: [typescript, javascript]
    severity: ERROR
    patterns:
      - pattern: jwtVerify($TOKEN, $KEY, { $...OPTS })
      - pattern-not: jwtVerify($TOKEN, $KEY, { algorithms: [...], $...OPTS })
    metadata:
      category: security
      cwe: "CWE-327: Use of a Broken or Risky Cryptographic Algorithm"
      finding: SEC-004
      confidence: HIGH
```

**Why not use the community rule directly**: Referencing `r/javascript.jose.security.audit.jwt-verify-algorithm-not-pinned` by registry path makes the gate depend on Semgrep's registry availability and version. Copying the pattern into `.semgrep.yml` keeps the gate reproducible, offline, and explicitly under repo ownership. If the community rule is later updated, it is a deliberate choice to adopt the update, not a silent breakage.

**Implementation tasks**:

- [ ] Create `.semgrep.yml` at the repo root with the rule above.
- [ ] Run `semgrep --config .semgrep.yml --error .` locally and confirm it fires on `verify-scoped-bearer.ts:50`.
- [ ] Confirm no other false-positive matches exist in the codebase (`grep -r jwtVerify` to find all call sites).
- [ ] After applying the SEC-004 fix (adding `algorithms: [alg]` to `jwtVerify`), confirm the rule passes clean.

**Tests**:

- `semgrep --config .semgrep.yml --error .` must report the finding on `verify-scoped-bearer.ts:50` before the fix.
- After the fix, the same command must exit 0.

---

### 5.4 Wire Into pnpm check

**Current `check` script** in `package.json`:

```json
"check": "pnpm lint && pnpm check:dup && pnpm typecheck && pnpm test"
```

**Target**:

```json
"check:security": "semgrep --config .semgrep.yml --error .",
"check": "pnpm lint && pnpm check:security && pnpm check:dup && pnpm typecheck && pnpm test"
```

`check:security` runs after `lint` because:
1. Both are fast pre-compilation gates that catch structural problems early.
2. A failed `lint` already surfaces the oxlint SEC-001 coverage; there is no point running Semgrep if lint is broken.
3. Placing it before `typecheck` and `test` means security regressions fail fast without waiting for the heavier compilation and test pass.

**Implementation tasks**:

- [ ] Add `"check:security": "semgrep --config .semgrep.yml --error ."` to `package.json` scripts.
- [ ] Update `"check"` to include `pnpm check:security` in the position above.
- [ ] Confirm `pnpm check` is fully green on the current codebase (with SEC-001 and SEC-004 fixed first).
- [ ] Document `pnpm check:security` in `README.md` under the commands section.
- [ ] Add semgrep installation to the developer setup and CI prerequisite docs (`docs/007_cloudflare-deployment-runbooks.md` if that document covers dev setup, or `README.md` directly).

## 6. Edge Cases And Failure Modes

- **Semgrep not installed locally**: `pnpm check:security` will fail with `command not found`. The error message is clear. Document the install step (`pip install semgrep` or `brew install semgrep`) in README and CI setup. Do not fall back silently — a missing tool that is supposed to be a hard gate must fail loudly.

- **Semgrep registry unavailable**: Because `.semgrep.yml` contains inline rule definitions (no `r/` registry references), the gate is fully offline. Registry unavailability has no effect.

- **False positive from the timing-unsafe rule in tests**: Test fixtures that compare token strings with `!==` for equality assertions (e.g., `expect(bearerToken(x)).not.toBe(expectedToken)`) would fire the rule. Prefer `toEqual`/`toBe` in test assertions rather than binary expressions. If a test legitimately needs binary `!==` on a token (e.g., asserting two tokens are distinct), add a file-level `// oxlint-disable-next-line security/timing-unsafe-bearer-comparison` with a comment explaining why.

- **New `jwtVerify` call site added without `algorithms`**: The Semgrep gate catches it at `pnpm check:security` before the PR merges. The developer sees the message pointing to SEC-004 and the register.

- **Semgrep pattern match on a future jose major version that changes call signatures**: If `jwtVerify` is renamed or the options shape changes, the rule silently stops matching (false negative rather than false positive). Monitor jose major-version upgrades and re-validate the rule pattern after any upgrade.

- **oxlint jsPlugin API change**: The custom rule format follows oxlint's JS plugin API used by `architecture.js`. If oxlint updates its plugin API in a major version, both `architecture.js` and `security.js` would need updating together. This is a known maintenance surface for the existing plugin, not new risk.

## 7. Definition Of Done

- `pnpm lint` reports `security/timing-unsafe-bearer-comparison` as an error on the current `bootstrap.routes.ts:41` comparison.
- After SEC-001 is fixed, `pnpm lint` passes clean with the new rule active.
- `semgrep --config .semgrep.yml --error .` reports a finding on `verify-scoped-bearer.ts:50`.
- After SEC-004 is fixed, `pnpm check:security` passes clean.
- `pnpm check` (full gate) is green with both fixes applied and both rules active.
- `"security": "warn"` is added to `.oxlintrc.json` categories with any noisy built-in rules explicitly turned off by name.
- `.semgrep.yml` is committed to the repo root with the inline rule (no `r/` registry references).
- `pnpm check:security` is documented in `README.md` under Commands.
- Semgrep install prerequisite is documented in `README.md` or `docs/007_cloudflare-deployment-runbooks.md`.
- `docs/security/security-register.md` SEC-001 and SEC-004 rows are updated to `Fixed` with the closing PR reference.

## 8. Final Model

```
pnpm check
  └── pnpm lint              (oxlint)
        ├── correctness: error
        ├── suspicious: error
        ├── security: warn              ← NEW: built-in security rules
        ├── architecture.js jsPlugin    (existing)
        └── security.js jsPlugin        ← NEW: SEC-001 timing-unsafe comparison
  └── pnpm check:security    (semgrep)
        └── .semgrep.yml                ← NEW: SEC-004 jwtVerify algorithms pin
  └── pnpm check:dup         (Fallow)
  └── pnpm typecheck         (tsc)
  └── pnpm test              (Vitest)
```

The gate is additive with zero new tool categories: oxlint already runs, Semgrep adds one config file and one script entry. The discipline rule — `.semgrep.yml` is the only Semgrep config that runs in the gate, rules enter it by explicit review only — keeps the gate noise-free as the codebase grows. When a future security audit (via `docs/security/`) identifies a new statically-catchable pattern, the decision to add it to the gate follows the same path: confirm zero false positives locally, add the rule, reference the finding ID.
