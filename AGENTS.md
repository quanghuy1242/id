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

## Package Manager

`pnpm@11.1.3` via corepack.

## Rules

1. Always keep README.md up to date when public commands, topology, or setup changes. (hard gate — do not skip)
2. When work from a planning document is completed, update status metadata or implementation notes in that document when the document asks for it.
3. Name planning documents with a leading numbered prefix in the `xxx_...` format so their sequence stays trackable.
