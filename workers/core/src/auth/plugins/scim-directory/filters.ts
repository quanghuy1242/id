import type { ParsedScimFilter, ScimFilterClause } from "./types";

const approvedFilterFields = new Set(["id", "userName", "members.value"]);

/**
 * Parses a single SCIM equality clause of the form `field eq "value"`.
 * Returns null for unrecognized or unsupported patterns.
 */
function parseSingleClause(raw: string): ScimFilterClause | null {
  const match = /^(\S+)\s+eq\s+"([^"]*)"$/.exec(raw.trim());
  if (!match) return null;
  const [, field, value] = match;
  if (!approvedFilterFields.has(field)) return null;
  return { field, op: "eq", value };
}

/**
 * Parses an approved SCIM filter string.
 *
 * Approved forms:
 *   - `id eq "value"`
 *   - `userName eq "value"`
 *   - `members.value eq "value"`
 *   - `id eq "value" and members.value eq "value"` (compound)
 *
 * Returns null when the filter string is empty or absent (no-filter case).
 * Throws a descriptive error for non-empty strings that do not match an approved form,
 * so callers can return a SCIM 400 with `scimType: invalidFilter`.
 */
export function parseScimFilter(raw: string | undefined | null): ParsedScimFilter | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;

  const trimmed = raw.trim();

  // Try compound `A and B` first (case-insensitive "and" separator).
  const andIdx = trimmed.search(/\s+and\s+/i);
  if (andIdx !== -1) {
    const leftRaw = trimmed.slice(0, andIdx);
    const afterAnd = trimmed.slice(andIdx).replace(/^\s+and\s+/i, "");
    const left = parseSingleClause(leftRaw);
    const right = parseSingleClause(afterAnd);
    if (!left || !right) {
      throw new Error(`Unsupported SCIM filter: ${raw}`);
    }
    return { kind: "and", left, right };
  }

  // Single clause.
  const clause = parseSingleClause(trimmed);
  if (!clause) throw new Error(`Unsupported SCIM filter: ${raw}`);
  return { kind: "single", clause };
}
