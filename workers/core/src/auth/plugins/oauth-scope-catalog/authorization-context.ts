import { APIError } from "better-auth/api";
import { authPluginConfig } from "../../config";
import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";

export type AuthorizationContextEnv = {
  readonly DB: unknown;
  readonly KV: BetterAuthKvStorage;
};

type MembershipRow = {
  readonly id: string;
};

type TeamIdRow = {
  readonly teamId: string;
};

type AdapterLike = {
  readonly findOne: <T>(query: {
    model: string;
    where: { field: string; value: unknown }[];
  }) => Promise<T | null>;
  readonly findMany: <T>(query: {
    model: string;
    where?: { field: string; value: unknown }[];
  }) => Promise<T[]>;
};

function isD1Database(value: unknown): value is D1Database {
  return typeof value === "object" && value !== null && "prepare" in value;
}

function isAdapterLike(value: unknown): value is AdapterLike {
  return typeof value === "object" && value !== null && "findOne" in value && "findMany" in value;
}

export async function assertUserBelongsToOrganization(
  env: Pick<AuthorizationContextEnv, "DB">,
  userId: string,
  organizationId: string,
): Promise<void> {
  let member: MembershipRow | null = null;
  if (isD1Database(env.DB)) {
    member = await env.DB
      .prepare(`select "id" from "member" where "userId" = ? and "organizationId" = ? limit 1`)
      .bind(userId, organizationId)
      .first<MembershipRow>();
  } else if (isAdapterLike(env.DB)) {
    member = await env.DB.findOne<MembershipRow>({
      model: "member",
      where: [
        { field: "userId", value: userId },
        { field: "organizationId", value: organizationId },
      ],
    });
  }
  if (!member) {
    throw new APIError("FORBIDDEN", { error_description: "user is not a member of selected organization" });
  }
}

export async function loadUserTeamIdsForOrganization(
  env: AuthorizationContextEnv,
  userId: string,
  organizationId: string,
): Promise<readonly string[]> {
  let rows: readonly TeamIdRow[] = [];
  if (isD1Database(env.DB)) {
    const result = await env.DB
      .prepare(
        `select tm."teamId"
         from "teamMember" tm
         join "team" t on t."id" = tm."teamId"
         where tm."userId" = ? and t."organizationId" = ?
         order by tm."teamId" asc`,
      )
      .bind(userId, organizationId)
      .all<TeamIdRow>();
    rows = result.results ?? [];
  } else if (isAdapterLike(env.DB)) {
    const teams = await env.DB.findMany<{ readonly id: string }>({
      model: "team",
      where: [{ field: "organizationId", value: organizationId }],
    });
    const teamIds = new Set(teams.map((team) => team.id));
    const memberships = await env.DB.findMany<TeamIdRow>({
      model: "teamMember",
      where: [{ field: "userId", value: userId }],
    });
    rows = memberships.filter((membership) => teamIds.has(membership.teamId));
  }
  const teamIds = [...new Set(rows.map((row) => row.teamId))].sort();
  return teamIds;
}

export function assertTeamIdsWithinTokenLimit(teamIds: readonly string[]): void {
  if (teamIds.length > authPluginConfig.maxTokenTeamIds) {
    throw new APIError("FORBIDDEN", { error_description: "too many teams for token claim" });
  }
}

export async function invalidateUserTeamIds(
  env: Pick<AuthorizationContextEnv, "KV">,
  userId: string,
  organizationId: string,
): Promise<void> {
  await env.KV.delete(`${authPluginConfig.teamMembershipCachePrefix}${organizationId}:${userId}`);
}
