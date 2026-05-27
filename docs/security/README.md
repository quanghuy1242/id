# Security Audits

Point-in-time audit snapshots and a living findings register for this repository.

## Files

- `security-register.md` — living truth: all findings, statuses, audit log
- `YYYYMMDD_NNNN_<topic>.md` — audit snapshots, one per audit event

## Severity Rubric

| Severity | Definition |
|----------|-----------|
| **High** | Direct path to account takeover, token forgery, or cross-tenant data exposure under realistic conditions. |
| **Medium** | Weakens an important defense or exposes a high-value target; exploitation requires a plausible precondition. |
| **Low** | Defense-in-depth concern or information disclosure with no immediate path to abuse. |
| **Info** | Hardening idea, operational note, or performance observation. |

## Audit Methodology

For each file under review, ask:

1. What attacker-controlled inputs reach this code?
2. What trust boundaries are crossed?
3. Where are authentication, authorization, and cryptographic decisions made?
4. What gets persisted or logged — are secrets redacted?
5. What cross-origin, cross-subdomain, or cross-tenant assumptions are made?

Focus areas specific to this repo:

- **Bootstrap route** — bearer token strength, rate limiting, race conditions
- **JWT / JWKS** — algorithm pinning, key rotation, grace period
- **Session / cookie** — domain scope, flags (`HttpOnly`, `Secure`, `SameSite`)
- **OAuth consent UI** — attacker-controlled display values, clickjacking
- **IP / header trust** — forwarded headers, `workers.dev` bypass
- **KV one-time tokens** — atomicity of read-then-delete
- **HTTP security headers** — CSP, HSTS, referrer-policy, permissions-policy
- **SQL** — parameterized queries, no string interpolation
- **Logging** — no raw secrets reaching structured logs

Findings already `Fixed` or `Accepted` in the register are excluded from new audit runs.

## Workflow

### Running a new audit

1. Read `security-register.md` to get the highest current SEC-NNN ID (the baseline).
2. Define scope: files or surfaces that are new or changed since the last audit.
3. Apply the methodology above. Do not re-examine findings already closed in the register.
4. Assign new SEC-NNN IDs continuing from the baseline.
5. Create a snapshot file: `YYYYMMDD_NNNN_<topic>.md`.
6. Append new rows to the register table and add a row to the audit log.

### Closing a finding

Update the `Status` column in `security-register.md` only — the snapshot is an immutable audit trail:

- `Fixed` — include the PR or commit reference in the status cell
- `Accepted` — include a one-line rationale
- `Won't Fix` — include a one-line rationale

## Snapshot Template

```markdown
# YYYYMMDD_NNNN — Security Audit: <topic>

> Date: YYYY-MM-DD
> Register baseline: SEC-NNN (highest ID before this run)
> Scope: <components or surfaces audited>
> Excluded: <what was not audited and why>

## Files Read

- `path/to/file.ts` — reason for inclusion

## New Findings

| ID | Title | Severity |
|----|-------|----------|
| SEC-NNN | ... | Medium |

## Detailed Findings

### SEC-NNN — Title

- **File**: `path/to/file.ts:line`
- **Severity**: Medium

[One paragraph: what the problem is and realistic exploitability.]

**Recommendation**: what to change, with a code snippet if the fix is non-obvious.

## Cross-Cutting Observations

[Delta only — things not already noted in prior audit snapshots.]

## Risks and Edge Cases

[Finding-combination scenarios and failure modes specific to this audit.]

## Test and Verification Plan

[Per-finding verification steps, enough to confirm each finding is closed.]

## Register Updates

New findings added: SEC-NNN – SEC-NNN
```
