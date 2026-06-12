import { APIError } from "better-auth/api";
import type { OAuthClientAdminPluginOptions } from "./types";

export type AuthorizeFn = NonNullable<
  OAuthClientAdminPluginOptions["authorize"]
>;

export function queryString(
  query: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = query?.[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function queryNumber(
  query: Record<string, unknown> | undefined,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const value = queryString(query, field);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new APIError("BAD_REQUEST", {
      message: `${field} must be an integer between ${min} and ${max}`,
    });
  }
  return parsed;
}

export function queryIds(
  query: Record<string, unknown> | undefined,
): readonly string[] | undefined {
  const value = queryString(query, "ids");
  if (!value) return undefined;
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export async function assertClientListAccess(
  authorize: AuthorizeFn | undefined,
  organizationId: string | null | undefined,
  userId: string,
  role: string | null | undefined,
  adapter: unknown,
): Promise<void> {
  if (!authorize || !(await authorize(organizationId, userId, role, adapter))) {
    throw new APIError("FORBIDDEN");
  }
}
