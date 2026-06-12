"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Badge,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  PageIntro,
  Panel,
  SearchInput,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  Text,
} from "@idco/ui";
import {
  getUser as getUserAction,
  listAdminsRoles as listAdminsRolesAction,
  type AdminDelegationBinding,
  type AdminsRolesSnapshot,
} from "../../_actions/access";
import type { User } from "../../_actions/users";
import { useUsersByIds } from "../../_data/use-users-by-ids";
import { adminsRolesKey } from "../../_data/swr-keys";

const defaultActions = {
  listAdminsRoles: listAdminsRolesAction,
  getUser: getUserAction,
};

type AdminsRolesContentProps = {
  readonly search?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly loading?: boolean;
  readonly error?: string;
  readonly actions?: typeof defaultActions;
};

type AuthorityRow = {
  readonly id: string;
  readonly userId: string;
  readonly user: User | null;
  readonly scope: "Platform" | string;
  readonly organizationId?: string;
  readonly organizationSlug?: string;
  readonly authority: "platform-admin" | "owner" | "admin" | "delegated";
  readonly roleLabel?: string;
  readonly principalType?: AdminDelegationBinding["principalType"];
  readonly source: "user.role" | "member.role" | "adminRoleBinding";
  readonly createdAt: string | number;
};

function delegatedScopeLabel(scope: string): string {
  if (scope === "platform") return "Platform";
  const [kind, id] = scope.split(":", 2);
  if (!kind || !id) return scope;
  if (kind === "organization") return `Organization ${id}`;
  if (kind === "oauth-client") return `OAuth client ${id}`;
  if (kind === "resource-server") return `Resource server ${id}`;
  return scope;
}

function rowsFromSnapshot(
  snapshot: AdminsRolesSnapshot | undefined,
  usersById: Map<string, User | null>,
): AuthorityRow[] {
  if (!snapshot) return [];
  const roleById = new Map(
    snapshot.delegatedRoles.map((role) => [role.id, role]),
  );
  return [
    ...snapshot.platformAdmins.map((user) => ({
      id: `platform:${user.id}`,
      userId: user.id,
      user,
      scope: "Platform" as const,
      authority: "platform-admin" as const,
      source: "user.role" as const,
      createdAt: user.createdAt,
    })),
    ...snapshot.organizationAuthorities.map(({ member, organization }) => ({
      id: `organization:${organization.id}:${member.id}`,
      userId: member.userId,
      user: usersById.get(member.userId) ?? null,
      scope: organization.name || organization.slug || organization.id,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      authority: member.role === "owner" ? "owner" as const : "admin" as const,
      source: "member.role" as const,
      createdAt: member.createdAt,
    })),
    ...snapshot.delegatedBindings.map((binding) => {
      const role = roleById.get(binding.roleId);
      const isUser = binding.principalType === "user";
      return {
        id: `delegated:${binding.id}`,
        userId: binding.principalId,
        user: isUser ? usersById.get(binding.principalId) ?? null : null,
        scope: delegatedScopeLabel(binding.scope),
        authority: "delegated" as const,
        roleLabel: role?.label ?? binding.roleId,
        principalType: binding.principalType,
        source: "adminRoleBinding" as const,
        createdAt: binding.createdAt,
      };
    }),
  ];
}

function authorityBadge(row: AuthorityRow) {
  if (row.authority === "platform-admin") {
    return (
      <Badge tone="primary" size="sm">
        Platform Admin
      </Badge>
    );
  }
  if (row.authority === "owner") {
    return (
      <Badge tone="warning" size="sm">
        Owner
      </Badge>
    );
  }
  if (row.authority === "delegated") {
    return (
      <Badge tone="secondary" size="sm">
        {row.roleLabel ?? "Delegated"}
      </Badge>
    );
  }
  return <Badge tone="info" size="sm">Org Admin</Badge>;
}

function matchesSearch(row: AuthorityRow, query: string): boolean {
  if (!query) return true;
  const haystack = [
    row.user?.name,
    row.user?.email,
    row.userId,
    row.scope,
    row.organizationId,
    row.authority,
    row.roleLabel,
    row.principalType,
    row.source,
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function AdminsRolesContent({
  search: searchProp,
  onSearchChange,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: AdminsRolesContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const effectiveSearch = searchProp ?? internalSearch;
  const handleSearchChange = onSearchChange ?? setInternalSearch;

  const { data, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : adminsRolesKey(),
    () => actions.listAdminsRoles(),
  );
  const userIds = useMemo(
    () => [
      ...new Set([
        ...(data?.organizationAuthorities ?? []).map(
          ({ member }) => member.userId,
        ),
        ...(data?.delegatedBindings ?? [])
          .filter((binding) => binding.principalType === "user")
          .map((binding) => binding.principalId),
      ]),
    ],
    [data],
  );
  const { usersById, isLoading: usersLoading } = useUsersByIds(
    userIds,
    actions.getUser,
  );

  const rows = useMemo(
    () => rowsFromSnapshot(data, usersById),
    [data, usersById],
  );
  const visibleRows = useMemo(
    () => rows.filter((row) => matchesSearch(row, effectiveSearch)),
    [effectiveSearch, rows],
  );

  const showLoading =
    loadingOverride ?? (isLoading || (Boolean(data) && usersLoading));
  const showError =
    errorOverride ??
    (error instanceof Error ? error.message : error ? String(error) : undefined);
  const stats = useMemo(
    () => ({
      platformAdmins: data?.platformAdmins.length ?? 0,
      orgAuthorities: data?.organizationAuthorities.length ?? 0,
      delegated: data?.delegatedBindings.length ?? 0,
      orgs: new Set(
        (data?.organizationAuthorities ?? []).map(
          ({ organization }) => organization.id,
        ),
      ).size,
    }),
    [data],
  );

  const columns: DataTableColumn<AuthorityRow>[] = [
    {
      key: "principal",
      label: "Principal",
      render: (row) => (
        <Stack gap="xs">
          <Text variant="body">{row.user?.name ?? row.userId}</Text>
          <Text variant="caption" mono>
            {row.user?.email ?? row.principalType ?? row.userId}
          </Text>
        </Stack>
      ),
    },
    {
      key: "authority",
      label: "Authority",
      render: authorityBadge,
    },
    {
      key: "scope",
      label: "Scope",
      render: (row) => (
        <Stack gap="xs">
          <Text variant="body">{row.scope}</Text>
          {row.organizationSlug ? (
            <Text variant="caption" mono>
              #{row.organizationSlug}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (row) => (
        <Badge tone="neutral" size="sm">
          {row.source}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      label: "Since",
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  function content() {
    if (showLoading) return <Skeleton rows={6} />;
    if (showError) {
      return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    }
    if (visibleRows.length === 0) {
      return effectiveSearch
        ? (
          <EmptyState
            message="No authority rows match your search"
            cta="Clear search"
            onCta={() => handleSearchChange("")}
          />
        )
        : (
          <EmptyState message="No admin authority found" />
        );
    }
    return (
      <DataTable
        columns={columns}
        rows={visibleRows}
        getRowKey={(row) => row.id}
      />
    );
  }

  return (
    <Stack gap="md">
      <PageIntro
        title="Admins & Roles"
        description="Platform admins, organization owner/admin memberships, and delegated admin role bindings."
      />
      <StatGroup columns={4}>
        <Stat
          title="Platform admins"
          value={showLoading ? <Skeleton rows={1} /> : stats.platformAdmins}
          tone="primary"
          iconName="UserCog"
        />
        <Stat
          title="Org authorities"
          value={showLoading ? <Skeleton rows={1} /> : stats.orgAuthorities}
          tone="info"
          iconName="UsersRound"
        />
        <Stat
          title="Delegated"
          value={showLoading ? <Skeleton rows={1} /> : stats.delegated}
          tone="success"
          iconName="ShieldCheck"
        />
        <Stat
          title="Organizations"
          value={showLoading ? <Skeleton rows={1} /> : stats.orgs}
          tone="warning"
          iconName="Building2"
        />
      </StatGroup>
      <Panel>
        <SearchInput
          value={effectiveSearch}
          onChange={handleSearchChange}
          placeholder="Search principals, scopes, or roles..."
          grow
        />
      </Panel>
      <Panel
        padding={visibleRows.length > 0 && !showLoading && !showError
          ? "none"
          : "md"}
      >
        {content()}
      </Panel>
    </Stack>
  );
}
