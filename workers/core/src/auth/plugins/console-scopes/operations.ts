import type {
  ConsoleMembershipHint,
  ConsolePermission,
  ConsoleScope,
  ConsoleScopeEnvelope,
} from "@id/lib";
import {
  CONSOLE_ADMIN_ROLE_RANK,
  CONSOLE_MEMBER_ROLE_RANK,
  CONSOLE_OWNER_ROLE_RANK,
  MEMBER_MODEL,
  ORGANIZATION_MODEL,
} from "../../../shared/constants";

export type ConsoleScopesAdapter = {
  readonly findMany: <T>(query: {
    model: string;
    where?: { field: string; value: unknown }[];
    sortBy?: { field: string; direction: "asc" | "desc" };
  }) => Promise<T[]>;
};

type ConsoleScopeUser = {
  readonly id: string;
  readonly email?: string | null;
  readonly role?: unknown;
};

type MemberRow = {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: unknown;
};

type OrganizationRow = {
  readonly id: string;
  readonly name?: string | null;
};

type OrganizationConsoleScope = Omit<ConsoleScope, "kind" | "id" | "organizationId" | "role"> & {
  readonly kind: "organization";
  readonly id: `organization:${string}`;
  readonly organizationId: string;
  readonly role: "platform-admin" | "owner" | "admin";
};

type OrganizationScopeItem = OrganizationConsoleScope | ConsoleMembershipHint;

export const platformConsolePermissions = [
  "platform:read",
  "platform:write",
  "organizations:read",
  "organizations:write",
  "oauth-clients:read",
  "oauth-clients:write",
  "resource-servers:read",
  "resource-servers:write",
  "security-audit:read",
  "jwks:read",
  "jwks:rotate",
  "system:read",
  "system:write",
] as const satisfies readonly ConsolePermission[];

export const organizationConsolePermissions = [
  "members:read",
  "members:write",
  "oauth-clients:read",
  "oauth-clients:write",
  "resource-servers:read",
  "resource-servers:write",
  "security-audit:read",
] as const satisfies readonly ConsolePermission[];

function membershipRole(value: unknown): "owner" | "admin" | "member" | null {
  return value === "owner" || value === "admin" || value === "member" ? value : null;
}

function roleRank(role: "owner" | "admin" | "member"): number {
  if (role === "owner") return CONSOLE_OWNER_ROLE_RANK;
  if (role === "admin") return CONSOLE_ADMIN_ROLE_RANK;
  return CONSOLE_MEMBER_ROLE_RANK;
}

function organizationLabel(row: OrganizationRow | undefined, organizationId: string): string {
  return row?.name?.trim() || organizationId;
}

function scopeId(organizationId: string): `organization:${string}` {
  return `organization:${organizationId}`;
}

function resolveDefaultScopeId(scopes: readonly ConsoleScope[]): ConsoleScope["id"] | null {
  const platform = scopes.find((scope) => scope.kind === "platform");
  if (platform) return platform.id;
  return scopes[0]?.id ?? null;
}

function isOrganizationConsoleScope(item: OrganizationScopeItem): item is OrganizationConsoleScope {
  return "kind" in item && item.kind === "organization";
}

async function loadOrganizationRows(
  adapter: ConsoleScopesAdapter,
  organizationIds: readonly string[],
): Promise<ReadonlyMap<string, OrganizationRow>> {
  const rows = await Promise.all(
    [...new Set(organizationIds)].map((organizationId) =>
      adapter.findMany<OrganizationRow>({
        model: ORGANIZATION_MODEL,
        where: [{ field: "id", value: organizationId }],
      })),
  );
  return new Map(rows.flat().map((row) => [row.id, row]));
}

async function loadAllOrganizationRows(adapter: ConsoleScopesAdapter): Promise<readonly OrganizationRow[]> {
  return adapter.findMany<OrganizationRow>({
    model: ORGANIZATION_MODEL,
    sortBy: { field: "name", direction: "asc" },
  });
}

function normalizeMemberships(rows: readonly MemberRow[]): readonly MemberRow[] {
  const byOrganization = new Map<string, MemberRow>();
  for (const row of rows) {
    const role = membershipRole(row.role);
    if (!role) continue;
    const existing = byOrganization.get(row.organizationId);
    if (!existing || roleRank(role) > roleRank(membershipRole(existing.role) ?? "member")) {
      byOrganization.set(row.organizationId, row);
    }
  }
  return [...byOrganization.values()];
}

function organizationConsoleScope(
  organizationId: string,
  label: string,
  role: OrganizationConsoleScope["role"],
): OrganizationConsoleScope {
  return {
    kind: "organization",
    id: scopeId(organizationId),
    organizationId,
    label,
    role,
    permissions: [...organizationConsolePermissions],
    requiresStepUp: false,
  };
}

export async function resolveConsoleScopeEnvelope(params: {
  readonly adapter: ConsoleScopesAdapter;
  readonly user: ConsoleScopeUser;
  readonly isPlatformAdmin: (role: unknown) => boolean;
  /** Whether the current session already holds a fresh platform step-up proof. */
  readonly platformStepUpSatisfied: boolean;
}): Promise<ConsoleScopeEnvelope> {
  const platformAdmin = params.isPlatformAdmin(params.user.role);
  const membershipRows = normalizeMemberships(await params.adapter.findMany<MemberRow>({
    model: MEMBER_MODEL,
    where: [{ field: "userId", value: params.user.id }],
    sortBy: { field: "createdAt", direction: "asc" },
  }));
  const organizationRows = await loadOrganizationRows(params.adapter, membershipRows.map((membership) => membership.organizationId));
  const platformOrganizationRows = platformAdmin ? await loadAllOrganizationRows(params.adapter) : [];

  const organizationScopes = membershipRows
    .map((membership): OrganizationScopeItem | null => {
      const role = membershipRole(membership.role);
      if (!role) return null;
      const label = organizationLabel(organizationRows.get(membership.organizationId), membership.organizationId);
      if (role === "member") {
        return { organizationId: membership.organizationId, label, role };
      }
      return organizationConsoleScope(membership.organizationId, label, role);
    })
    .filter((scope): scope is OrganizationScopeItem => scope !== null)
    .sort((left, right) => left.label.localeCompare(right.label) || left.organizationId.localeCompare(right.organizationId));

  const scopes: ConsoleScope[] = platformAdmin
    ? [{
        kind: "platform",
        id: "platform",
        label: "Platform",
        role: "platform-admin",
        permissions: [...platformConsolePermissions],
        requiresStepUp: true,
        stepUpSatisfied: params.platformStepUpSatisfied,
      }]
    : [];
  const memberships: ConsoleMembershipHint[] = [];

  if (platformAdmin) {
    scopes.push(...platformOrganizationRows
      .map((row) => organizationConsoleScope(row.id, organizationLabel(row, row.id), "platform-admin"))
      .sort((left, right) => left.label.localeCompare(right.label) || left.organizationId.localeCompare(right.organizationId)));
  } else {
    for (const item of organizationScopes) {
      if (isOrganizationConsoleScope(item)) {
        scopes.push(item);
      } else {
        memberships.push(item);
      }
    }
  }

  const email = typeof params.user.email === "string" && params.user.email.length > 0
    ? params.user.email
    : undefined;

  return {
    actor: {
      userId: params.user.id,
      ...(email ? { email } : {}),
      canEnterConsole: scopes.length > 0,
    },
    scopes,
    memberships,
    defaultScopeId: resolveDefaultScopeId(scopes),
  };
}
