**Before starting any task, evaluate the prompt and load relevant skills using the skill tool.** Check the available skills list at the top of the system message for matches (e.g. `id-architecture`, `id-auth-plugin`, `id-admin-ui`). Do not analyze or modify architecture-boundary code without loading the applicable skill first.

## Commands

- `pnpm check` — full CI gate: lint (oxlint architecture gate) → duplicate gate (Fallow mild) → typecheck → test
- `pnpm lint` — oxlint with strict architecture rules (the architecture gate)
- `pnpm lint:fix` — auto-correct safe lint issues
- `pnpm check:dup` — hard duplicate-code gate with Fallow mild mode and the repo's 3% wrapper threshold
- `pnpm advise` — advisory quality pass: Aislop + conservative semantic Fallow (filtered: suppresses known noise)
- `pnpm advise:raw` — unfiltered advisory output (shows all findings including known noise)
- `pnpm advise:aislop` — broad advisory scanner for duplicate imports, duplicate blocks, complexity, wrapper, and security signals
- `pnpm typecheck` — strict TypeScript across packages and both Workers
- `pnpm test` — Vitest workspace

## Architecture Invariants

The oxlint plugin at `scripts/oxlint-js-plugins/architecture.js` enforces clean-architecture layer boundaries plus id-specific worker/package/auth boundaries. Rules are wired in `.oxlintrc.json`. Fix the code — never loosen rules to pass lint.

`docs/000_repo-architecture.md` is the architecture constitution. `docs/001_first-batch-plan.md` defines product scope. `docs/002_implementation-sequence.md` defines phase order.

Core rules:

- **OAuth2/OIDC standard compliance**: This repo implements OAuth2.1/OIDC as specified by the standards. Suggesting custom workarounds (manual token revocation outside the protocol, non-standard logout propagation, patching plugin internals) is forbidden. If a user request goes against the standard, explain why it is not standard practice and describe the correct standards-based flow instead. The word "ugly" in feedback means the suggestion violated this rule.
- **Standards-first identity research**: When investigating identity, directory, OAuth client, service-account, lifecycle, logout, revocation, token, or resource-server contracts, classify every proposed mechanism before recommending it: protocol standard, established interoperability standard or industry pattern, Better Auth-supported capability, repository-specific extension, or inappropriate workaround. A repository-specific mechanism is allowed only when the precise unmet requirement is documented and the applicable standards are insufficient, unsuitable, or disproportionate. Do not justify a custom identity API by mixing it with an unrelated standard and calling the combination "covered."
- **SCIM directory boundary**: SCIM v2 read/query is the standards-shaped synchronous directory contract for Users and Groups. Do not present custom exact-ID user/team/admin validation as the long-term replacement for SCIM. If the scope is durable principal lookup for users, organization users, teams/groups, or organization administrators, prefer a read-only SCIM profile and mark any existing custom endpoint as a temporary compatibility surface unless a document records why SCIM is not being adopted.
- **M2M/service-account boundary**: OAuth client-credentials, resource indicators, JWT/JWKS verification, token introspection, revocation, and client metadata belong to the OAuth authorization-server model. Do not force OAuth clients/service accounts into SCIM core. If a service-account attach/bind workflow needs behavior not defined by OAuth or SCIM, document the options explicitly (for example proof-token, GCP-style attach/use split, or OAuth AS management extension), classify any extension as repository-specific, and keep runtime access on the standard OAuth path.
- `workers/core` owns Better Auth, OAuth, D1/KV, JWKS, admin APIs, and domain/application rules.
- `workers/ui` owns admin presentation under `/admin/*`; hosted UI pages call same-origin core `/api/auth/*` endpoints directly. It must not import Better Auth, Drizzle, Jose, D1/KV types, or core source.
- Workers never import each other. Shared contracts live in `packages/`.
- `packages/lib` is framework-free.
- Better Auth imports belong in `workers/core/src/auth/**`, approved core mounting files, or tests.
- Custom tables are Better Auth plugin schemas, not standalone Drizzle schema definitions.
- `workers/core/src/infrastructure/db/schema.ts` remains empty. New tables require a BA plugin and architecture-plan approval.
- Core route handlers call `requireActor(c)` for `/api/admin/*`, call exactly one use case, and present output.

## Advisory Checks

Run `pnpm advise` after substantial code changes. The filter script (`scripts/filter-advise.mjs`) suppresses known noise via `.advise-suppressions.json` and shows only new findings.

When new findings appear, handle them autonomously:

1. **Auto-suppress** these categories without asking when they match architecture-mandated patterns:
   - `complexity/file-too-large` in `scripts/oxlint-js-plugins/architecture.js`
   - `complexity/function-too-long` in route registration or composition wiring
   - `code-quality/duplicate-block` in route files (`*.routes.ts`) where each route validates + calls one use case + presents
   - `code-quality/duplicate-block` in mapper files (`*.mapper.ts`) where explicit one-to-one field mapping is required
   - `ai-slop/narrative-comment` where JSDoc is required at architectural boundaries
   - `security/vulnerable-dependency` — note it, do not auto-upgrade deps without checking compatibility

2. **Auto-suppress** fallow clone groups between known file sets:
   - `*/*.entity.ts` files with other entity files — entity class shape is mandated
   - `create-*.use-case.ts` files with other create use cases — create/replay patterns are structurally similar by design
   - mapper files — explicit field mapping pattern

3. **Review**:
   - new rule types not in the list above
   - clone groups involving files not in an existing suppression entry
   - `security/*`
   - any finding with `severity: error`

4. **To add a suppression**: append to `.advise-suppressions.json`:
   - aislop: `{ "tool": "aislop", "file": "<filePath>", "rule": "<rule>", "reason": "<why>" }`
   - fallow: `{ "tool": "fallow", "files": "<sorted|paths>", "reason": "<why>" }`

5. Re-run `pnpm advise` to verify clean.

## Tests

- Worker tests live under `workers/*/tests`.
- `@/*` maps to each worker's own `src/*` in tsconfig and Vitest aliases.
- Do not use external services in tests. Mock Better Auth, D1/KV, route ownership, and JWKS boundaries where the phase does not explicitly require local Wrangler integration.
- Test performance depends on one barrel file per Vitest project: `workers/core/tests/all.test.ts` and `workers/ui/tests/all.test.ts`. Each worker config includes only its barrel. Add every new test file to the matching barrel; do not widen `include` back to `tests/**/*.test.*`, because that restores per-file environment/import overhead.
- When a test file is imported by a barrel, top-level hooks become project-wide hooks. Keep `beforeAll`/`beforeEach` inside the relevant `describe(...)` block unless the hook is intentionally global for every test in that worker project.
- Use `pnpm test --reporter=verbose 2>/dev/null | grep -E "tests/.*ms"` when troubleshooting latency. Treat repeated first-test jsdom costs, repeated database/app bootstrap, and repeated command subprocesses as candidates for shared setup or direct seeding.
- Run `pnpm lint` and `pnpm test` after any change — core or UI. The lint gate covers architecture invariants, UI route contracts, constants placement, and duplicate code; tests verify correctness across both workers and packages.

## Package Manager

`pnpm@11.1.3` via corepack.

## Admin UI

Load the `id-admin-ui` skill when working on any of the following:

- Any file under `workers/ui/src/app/admin/**`
- Any component in `packages/ui/src/**`
- Any screen spec in `workers/ui/docs/screens/`
- Any question about what components exist, what token values are, or what the screen spec format is

The skill contains the full component registry, token reference, screen spec format, and hard rules. Do not implement admin UI pages without it.

All admin UI `/api/auth` calls must use the type-safe helpers from `@id/lib` (`authApiGetOrThrow`, `authApiPostOrThrow`, `authApiGet`, `authApiPost`); never write raw `fetch()` against `/api/auth` in admin or UI action files.

**Hard gate:** A new `/admin` route file must not be created before a corresponding spec entry exists in `workers/ui/docs/screens/<section>.md`. Draft the spec, get approval, then implement. The spec must contain at minimum the ASCII sketch, the `Components:` block, and the `Data:` line.

Design system architecture rationale lives in `docs/022_admin-ui-system.md`.

## Rules

1. Always keep README.md up to date (hard gate — do not skip). If `git diff` shows a new `docs/<NNN>_*.md` file, add it to the Contracts section. If public commands, topology, setup steps, or the doc listing change, README.md must reflect them.
2. When work from a planning document is completed, update status metadata or implementation notes in that document when the document asks for it.
3. Name planning documents with a leading numbered prefix in the `xxx_...` format so their sequence stays trackable.
4. Never craft migration SQL or snapshot files manually. After changing `workers/core/src/db/auth-schema.ts` or any plugin-owned table definitions, run `pnpm db:generate`. Hand-written SQL drifts the journal, snapshot, and column ordering away from Drizzle's expected state and breaks future runs.
5. Remember that we support remote config avoid hard config at all cost, now hard config of client id or client name in this repo, those must be controled via database.
6. During review, absolutely honor any user-provided implementation plan and do not change that plan; gather recommendations about edge cases, concurrent use cases, architectural design, or race conditions and present them to the user after plan-conforming code review and fixes, for explicit approval before implementation.
