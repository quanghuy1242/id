import {
  ACCOUNT_MODEL,
  MEMBER_MODEL,
  OAUTH_CLIENT_MODEL,
  OAUTH_CONSENT_MODEL,
  ORGANIZATION_MODEL,
  SESSION_MODEL,
  TEAM_MEMBER_MODEL,
  TEAM_MODEL,
} from "../../../shared/constants";
import type {
  AccountClientRow,
  AccountConsentRow,
  AccountCredentialRow,
  AccountMemberRow,
  AccountOrganizationRow,
  AccountSessionRow,
  AccountTeamMemberRow,
  AccountTeamRow,
  AccountUserRow,
} from "./schema";

type AdapterWhere = { readonly field: string; readonly value: unknown; readonly operator?: "in" };

export type AccountCenterAdapter = {
  readonly findOne: <T>(query: { readonly model: string; readonly where?: readonly AdapterWhere[] }) => Promise<T | null>;
  readonly findMany: <T>(query: {
    readonly model: string;
    readonly where?: readonly AdapterWhere[];
    readonly sortBy?: { readonly field: string; readonly direction: "asc" | "desc" };
  }) => Promise<T[]>;
  readonly count: (query: { readonly model: string; readonly where?: readonly AdapterWhere[] }) => Promise<number | string | bigint>;
  readonly delete: (query: { readonly model: string; readonly where: readonly AdapterWhere[] }) => Promise<unknown>;
};

export type PresentedAccountUser = {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly image: string | null;
};

export type PresentedAccountSession = {
  readonly id: string;
  readonly current: boolean;
  readonly createdAt: number | null;
  readonly updatedAt: number | null;
  readonly expiresAt: number | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

export type PresentedAccountConsent = {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string | null;
  readonly clientUri: string | null;
  readonly clientIcon: string | null;
  readonly scopes: string[];
  readonly createdAt: number | null;
  readonly updatedAt: number | null;
};

export type PresentedAccountOrganization = {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly role: "platform-admin" | "owner" | "admin" | "member";
  readonly teams: readonly { readonly id: string; readonly name: string }[];
  readonly canOpenConsole: boolean;
  readonly consoleHref: string | null;
};

type MembershipRole = "owner" | "admin" | "member";

function toMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function isActiveSession(row: AccountSessionRow, nowMs = Date.now()): boolean {
  const expiresAt = toMs(row.expiresAt);
  return expiresAt === null || expiresAt > nowMs;
}

function normalizeScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) return scopes.map(String).filter(Boolean);
  if (typeof scopes === "string") {
    const parsed = scopes.trim().startsWith("[") ? parseJsonArray(scopes) : null;
    return parsed ?? scopes.split(/[\s,]+/u).filter(Boolean);
  }
  return [];
}

function parseJsonArray(value: string): string[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : null;
  } catch {
    return null;
  }
}

function membershipRole(value: unknown): MembershipRole | null {
  return value === "owner" || value === "admin" || value === "member" ? value : null;
}

function organizationName(row: AccountOrganizationRow | undefined, organizationId: string): string {
  return row?.name?.trim() || organizationId;
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

export function presentAccountUser(row: AccountUserRow): PresentedAccountUser {
  return {
    id: row.id,
    email: row.email ?? "",
    emailVerified: row.emailVerified === true || row.emailVerified === 1,
    name: row.name?.trim() || null,
    image: row.image?.trim() || null,
  };
}

export function presentAccountSession(
  row: AccountSessionRow,
  currentSessionId: string | null | undefined,
): PresentedAccountSession {
  return {
    id: row.id,
    current: row.id === currentSessionId,
    createdAt: toMs(row.createdAt),
    updatedAt: toMs(row.updatedAt),
    expiresAt: toMs(row.expiresAt),
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
  };
}

export function presentAccountConsent(
  row: AccountConsentRow,
  clientById: ReadonlyMap<string, AccountClientRow>,
): PresentedAccountConsent {
  const client = clientById.get(row.clientId);
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: client?.name?.trim() || null,
    clientUri: client?.uri?.trim() || null,
    clientIcon: client?.icon?.trim() || null,
    scopes: normalizeScopes(row.scopes),
    createdAt: toMs(row.createdAt),
    updatedAt: toMs(row.updatedAt),
  };
}

export async function loadPasswordEnabled(
  adapter: AccountCenterAdapter,
  userId: string,
): Promise<boolean> {
  const row = await adapter.findOne<AccountCredentialRow>({
    model: ACCOUNT_MODEL,
    where: [
      { field: "userId", value: userId },
      { field: "providerId", value: "credential" },
    ],
  });
  return Boolean(row?.password);
}

export async function loadActiveSessions(
  adapter: AccountCenterAdapter,
  userId: string,
): Promise<readonly AccountSessionRow[]> {
  const rows = await adapter.findMany<AccountSessionRow>({
    model: SESSION_MODEL,
    where: [{ field: "userId", value: userId }],
    sortBy: { field: "createdAt", direction: "desc" },
  });
  return rows.filter((row) => isActiveSession(row));
}

export async function loadCurrentUserMemberships(
  adapter: AccountCenterAdapter,
  userId: string,
): Promise<readonly AccountMemberRow[]> {
  return adapter.findMany<AccountMemberRow>({
    model: MEMBER_MODEL,
    where: [{ field: "userId", value: userId }],
    sortBy: { field: "createdAt", direction: "asc" },
  });
}

export async function loadConnectedApplicationCount(
  adapter: AccountCenterAdapter,
  userId: string,
): Promise<number> {
  return Number(await adapter.count({
    model: OAUTH_CONSENT_MODEL,
    where: [{ field: "userId", value: userId }],
  }));
}

export async function loadAccountConsents(
  adapter: AccountCenterAdapter,
  userId: string,
): Promise<readonly PresentedAccountConsent[]> {
  const rows = await adapter.findMany<AccountConsentRow>({
    model: OAUTH_CONSENT_MODEL,
    where: [{ field: "userId", value: userId }],
    sortBy: { field: "updatedAt", direction: "desc" },
  });
  const clients = await loadClientRows(adapter, uniqueStrings(rows.map((row) => row.clientId)));
  return rows.map((row) => presentAccountConsent(row, clients));
}

async function loadClientRows(
  adapter: AccountCenterAdapter,
  clientIds: readonly string[],
): Promise<ReadonlyMap<string, AccountClientRow>> {
  if (clientIds.length === 0) return new Map();
  const rows = await adapter.findMany<AccountClientRow>({
    model: OAUTH_CLIENT_MODEL,
    where: [{ field: "clientId", value: clientIds, operator: "in" }],
  });
  return new Map(rows.map((row) => [row.clientId, row]));
}

async function loadOrganizationRows(
  adapter: AccountCenterAdapter,
  organizationIds: readonly string[],
): Promise<ReadonlyMap<string, AccountOrganizationRow>> {
  if (organizationIds.length === 0) return new Map();
  const rows = await adapter.findMany<AccountOrganizationRow>({
    model: ORGANIZATION_MODEL,
    where: [{ field: "id", value: organizationIds, operator: "in" }],
    sortBy: { field: "name", direction: "asc" },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadAllOrganizationRows(adapter: AccountCenterAdapter): Promise<readonly AccountOrganizationRow[]> {
  return adapter.findMany<AccountOrganizationRow>({
    model: ORGANIZATION_MODEL,
    sortBy: { field: "name", direction: "asc" },
  });
}

async function loadTeamRows(
  adapter: AccountCenterAdapter,
  userId: string,
): Promise<readonly AccountTeamRow[]> {
  const teamMembers = await adapter.findMany<AccountTeamMemberRow>({
    model: TEAM_MEMBER_MODEL,
    where: [{ field: "userId", value: userId }],
  });
  const teamIds = uniqueStrings(teamMembers.map((row) => row.teamId));
  if (teamIds.length === 0) return [];
  return adapter.findMany<AccountTeamRow>({
    model: TEAM_MODEL,
    where: [{ field: "id", value: teamIds, operator: "in" }],
    sortBy: { field: "name", direction: "asc" },
  });
}

export async function loadAccountOrganizations(params: {
  readonly adapter: AccountCenterAdapter;
  readonly userId: string;
  readonly role: unknown;
  readonly isPlatformAdmin: (role: unknown) => boolean;
}): Promise<readonly PresentedAccountOrganization[]> {
  const platformAdmin = params.isPlatformAdmin(params.role);
  const memberships = await loadCurrentUserMemberships(params.adapter, params.userId);
  const teams = await loadTeamRows(params.adapter, params.userId);
  const teamsByOrganization = new Map<string, AccountTeamRow[]>();
  for (const team of teams) {
    const list = teamsByOrganization.get(team.organizationId) ?? [];
    list.push(team);
    teamsByOrganization.set(team.organizationId, list);
  }

  if (platformAdmin) {
    const organizationRows = await loadAllOrganizationRows(params.adapter);
    return organizationRows.map((organization) => ({
      id: organization.id,
      name: organizationName(organization, organization.id),
      slug: organization.slug?.trim() || null,
      role: "platform-admin",
      teams: (teamsByOrganization.get(organization.id) ?? []).map((team) => ({ id: team.id, name: team.name?.trim() || team.id })),
      canOpenConsole: true,
      consoleHref: `/admin/orgs/${encodeURIComponent(organization.id)}`,
    }));
  }

  const organizationRows = await loadOrganizationRows(params.adapter, memberships.map((row) => row.organizationId));
  return memberships
    .map((membership): PresentedAccountOrganization | null => {
      const role = membershipRole(membership.role);
      if (!role) return null;
      const row = organizationRows.get(membership.organizationId);
      const canOpenConsole = role === "owner" || role === "admin";
      return {
        id: membership.organizationId,
        name: organizationName(row, membership.organizationId),
        slug: row?.slug?.trim() || null,
        role,
        teams: (teamsByOrganization.get(membership.organizationId) ?? []).map((team) => ({ id: team.id, name: team.name?.trim() || team.id })),
        canOpenConsole,
        consoleHref: canOpenConsole ? `/admin/orgs/${encodeURIComponent(membership.organizationId)}` : null,
      };
    })
    .filter((organization): organization is PresentedAccountOrganization => organization !== null)
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}
