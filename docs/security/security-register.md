# Security Register

Living index of all security findings across audits. Update `Status` here when a finding is fixed or accepted; the snapshot is the immutable audit trail. See `README.md` for the severity rubric and workflow.

**Statuses:** `Open` · `Fixed` (PR #NNN or commit) · `Accepted` (one-line rationale) · `Won't Fix` (one-line rationale)

## Register

| ID      | Title                                              | Severity | Status | Component      | Source                  |
|---------|----------------------------------------------------|----------|--------|----------------|-------------------------|
| SEC-001 | Bootstrap bearer comparison is not constant-time   | Medium   | Open   | core/bootstrap | 20260527_0001 §SEC-001  |
| SEC-002 | Bootstrap endpoint has no app-level rate limit     | Medium   | Open   | core/bootstrap | 20260527_0001 §SEC-002  |
| SEC-003 | Better Auth rate limiting disabled globally        | Medium   | Open   | core/auth      | 20260527_0001 §SEC-003  |
| SEC-004 | JWT verification does not pin signing algorithm    | Medium   | Open   | core/jwt       | 20260527_0001 §SEC-004  |
| SEC-005 | `ipAddressHeaders` trusts client-supplied XFF      | Medium   | Open   | core/config    | 20260527_0001 §SEC-005  |
| SEC-006 | Cross-subdomain session cookie scope               | Medium   | Open   | core/auth      | 20260527_0001 §SEC-006  |
| SEC-007 | Bootstrap check-then-act race window               | Low      | Open   | core/bootstrap | 20260527_0001 §SEC-007  |
| SEC-008 | KV `getAndDelete` is not atomic                    | Medium   | Open   | core/kv        | 20260527_0001 §SEC-008  |
| SEC-009 | `ID_BOOTSTRAP_TOKEN` has no minimum-strength check | Low      | Open   | core/env       | 20260527_0001 §SEC-009  |
| SEC-010 | JWKS 30-day grace period, no per-`kid` revocation  | Info     | Open   | core/jwks      | 20260527_0001 §SEC-010  |
| SEC-011 | `verify-scoped-bearer` scans all JWKS rows per call| Info     | Open   | core/jwt       | 20260527_0001 §SEC-011  |
| SEC-012 | Consent displays attacker-controlled `client_name` | Medium   | Open   | ui/consent     | 20260527_0001 §SEC-012  |
| SEC-013 | Hosted UI pages lack `frame-ancestors` protection  | Medium   | Open   | ui/headers     | 20260527_0001 §SEC-013  |
| SEC-014 | `router.push` accepts unvalidated redirect URLs    | Low      | Open   | ui/router      | 20260527_0001 §SEC-014  |
| SEC-015 | Missing CSP / HSTS / referrer / permissions-policy | Medium   | Open   | ui/headers     | 20260527_0001 §SEC-015  |
| SEC-016 | `/admin/api` placeholder leaks developer metadata  | Low      | Open   | ui/admin       | 20260527_0001 §SEC-016  |
| SEC-017 | `fetchOrganizations` accepts unvalidated JSON shape | Low      | Open   | ui/orgs        | 20260527_0001 §SEC-017  |
| SEC-018 | Login enforces only client-side password length    | Info     | Open   | ui/login       | 20260527_0001 §SEC-018  |

## Audit Log

| Date       | Snapshot                                | Scope                                          | New Findings | Closed |
|------------|-----------------------------------------|------------------------------------------------|--------------|--------|
| 2026-05-27 | 20260527_0001_workers-security-findings | workers/core + workers/ui initial static audit | SEC-001–018  | —      |
