import {
  ADMIN_ACTIVITY_LOG_MODEL,
} from "../../../shared/constants";
import {
  ADMIN_AUDIT_DEFAULT_PAGE_LIMIT,
  ADMIN_AUDIT_MAX_PAGE_LIMIT,
} from "../../config";
import type { ActivityAdapter, ActivityAdapterWhere, ActivityRecordInput } from "./types";
import type { AdminActivityLogRow, PresentedActivity } from "./schema";

export type ActivityPageParams = { limit: number; offset: number };

const sensitiveKeys = new Set([
  "accesstoken",
  "clientsecret",
  "idtoken",
  "newpassword",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "sessiontoken",
  "softwarestatement",
  "token",
  "value",
]);

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/gu, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return sensitiveKeys.has(normalized) || normalized.endsWith("secret") || normalized.endsWith("password");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Recursively strips secret material before activity payloads are persisted.
 *
 * This intentionally operates on field names, not values. It catches OAuth
 * client secrets, token bodies, private JWKS material, password-change bodies,
 * and Better Auth verification values while preserving harmless fields such as
 * `token_endpoint_auth_method`.
 */
export function stripActivitySecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripActivitySecrets);
  if (!isPlainRecord(value)) return value;

  const cleaned: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    cleaned[key] = stripActivitySecrets(child);
  }
  return cleaned;
}

function stringifyPayload(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(stripActivitySecrets(value));
}

export function parsePayload(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseActivityPageParams(query: { limit?: unknown; offset?: unknown } | undefined): ActivityPageParams {
  const rawLimit = Number(query?.limit);
  const rawOffset = Number(query?.offset);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), ADMIN_AUDIT_MAX_PAGE_LIMIT) : ADMIN_AUDIT_DEFAULT_PAGE_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

export function activityFilters(query: Record<string, unknown> | undefined): ActivityAdapterWhere[] | undefined {
  const where: ActivityAdapterWhere[] = [];
  for (const field of ["targetType", "targetId", "action", "actorId"] as const) {
    const value = query?.[field];
    if (typeof value === "string" && value.length > 0) where.push({ field, value });
  }
  return where.length > 0 ? where : undefined;
}

export async function appendActivityLog(
  adapter: Pick<ActivityAdapter, "create">,
  input: ActivityRecordInput,
): Promise<AdminActivityLogRow> {
  return adapter.create<AdminActivityLogRow>({
    model: ADMIN_ACTIVITY_LOG_MODEL,
    data: {
      actorId: input.actorId,
      actorType: input.actorType ?? "user",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: stringifyPayload(input.before),
      after: stringifyPayload(input.after),
      metadata: stringifyPayload(input.metadata),
      createdAt: Date.now(),
    },
  });
}

export function presentActivity(row: AdminActivityLogRow, actorEmails: Map<string, string>): PresentedActivity {
  return {
    id: row.id,
    actorId: row.actorId,
    actorType: row.actorType,
    actorEmail: actorEmails.get(row.actorId) ?? null,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    before: parsePayload(row.before),
    after: parsePayload(row.after),
    metadata: parsePayload(row.metadata),
    createdAt: row.createdAt,
  };
}

export function uniqueActorIds(rows: readonly Pick<AdminActivityLogRow, "actorId" | "actorType">[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.actorType === "user") ids.add(row.actorId);
  }
  return [...ids];
}
