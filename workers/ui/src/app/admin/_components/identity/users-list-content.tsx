"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import {
  Badge,
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  FilterDropdown,
  Inline,
  MobileFilterMenu,
  PageIntro,
  Panel,
  RadioGroup,
  SearchInput,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  Text,
  TextInput,
  toast,
} from "@idco/ui";
import {
  createUser as createUserAction,
  listUsers as listUsersAction,
  type CreateUserBody,
  type ListUsersParams,
  type ListUsersResponse,
  type User,
} from "../../_actions/users";
import { usersListKey } from "@/app/admin/_data/swr-keys";

const pageLimit = 25;

const defaultActions = {
  listUsers: listUsersAction,
  createUser: createUserAction,
};

const roleFilterOptions = [
  { value: "all", label: "All Roles" },
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

const statusFilterOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "banned", label: "Banned" },
];

const roleOptions = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

const columns: DataTableColumn<User>[] = [
  {
    key: "name",
    label: "User",
    sortable: true,
    render: (u) => (
      <Inline gap="sm" align="center">
        <Avatar initials={u.name?.slice(0, 2).toUpperCase()} image={u.image ?? undefined} alt={u.name} size="sm" />
        <Text variant="body">{u.name}</Text>
      </Inline>
    ),
  },
  { key: "email", label: "Email", sortable: true },
  {
    key: "role",
    label: "Role",
    render: (u) => (
      <Badge tone={u.role === "admin" ? "primary" : "neutral"}>{u.role}</Badge>
    ),
  },
  {
    key: "banned",
    label: "Status",
    render: (u) =>
      u.banned ? (
        <Badge tone="error">Banned</Badge>
      ) : (
        <Badge tone="success">Active</Badge>
      ),
  },
  {
    key: "emailVerified",
    label: "Verified",
    render: (u) =>
      u.emailVerified ? (
        <Badge tone="success">Verified</Badge>
      ) : (
        <Badge tone="warning">Unverified</Badge>
      ),
  },
  {
    key: "createdAt",
    label: "Created",
    sortable: true,
    render: (u) => new Date(u.createdAt).toLocaleDateString(),
  },
];

type UsersListContentProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  roleFilter?: string;
  onRoleFilterChange?: (value: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string, dir: "asc" | "desc") => void;
  page?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (userId: string) => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  defaultCreateOpen?: boolean;
  actions?: {
    listUsers: (params: ListUsersParams) => Promise<ListUsersResponse>;
    createUser: (body: CreateUserBody) => Promise<{ user: User }>;
  };
};

export function UsersListContent({
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
  onRetry,
  onRowClick,
  defaultCreateOpen = false,
  ...props
}: UsersListContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalRole, setInternalRole] = useState("all");
  const [internalStatus, setInternalStatus] = useState("all");
  const [internalSortBy, setInternalSortBy] = useState("createdAt");
  const [internalSortDir, setInternalSortDir] = useState<"asc" | "desc">("desc");
  const [internalOffset, setInternalOffset] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(defaultCreateOpen);
  const [createError, setCreateError] = useState<string | undefined>();

  const effectiveSearch = props.searchValue ?? internalSearch;
  const effectiveRole = props.roleFilter ?? internalRole;
  const effectiveStatus = props.statusFilter ?? internalStatus;
  const effectiveSortBy = props.sortBy ?? internalSortBy;
  const effectiveSortDir = props.sortDirection ?? internalSortDir;
  const effectiveOffset =
    props.page !== undefined ? (props.page - 1) * pageLimit : internalOffset;

  const handleSearchChange =
    props.onSearchChange ?? ((v: string) => setInternalSearch(v));
  const handleRoleFilterChange =
    props.onRoleFilterChange ??
    ((v: string) => { setInternalRole(v); setInternalOffset(0); });
  const handleStatusFilterChange =
    props.onStatusFilterChange ??
    ((v: string) => { setInternalStatus(v); setInternalOffset(0); });
  const handleSort =
    props.onSort ??
    ((key: string, dir: "asc" | "desc") => {
      setInternalSortBy(key);
      setInternalSortDir(dir);
      setInternalOffset(0);
    });
  const handlePageChange =
    props.onPageChange !== undefined
      ? (offset: number) => props.onPageChange!(Math.floor(offset / pageLimit) + 1)
      : (offset: number) => setInternalOffset(offset);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(effectiveSearch);
      if (props.page === undefined) setInternalOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [effectiveSearch]); // intentionally omit props.page — only the search value drives debounce

  // Server params only — status is filtered client-side (below) and must not
  // enter the key; search is keyed on the debounced value, never raw input.
  const params: ListUsersParams = useMemo(() => ({
    limit: pageLimit,
    offset: effectiveOffset,
    sortBy: effectiveSortBy,
    sortDirection: effectiveSortDir,
    ...(debouncedSearch
      ? { searchValue: debouncedSearch, searchField: "email" as const, searchOperator: "contains" as const }
      : {}),
    ...(effectiveRole !== "all"
      ? { filterField: "role", filterValue: effectiveRole, filterOperator: "eq" }
      : {}),
  }), [effectiveOffset, effectiveSortBy, effectiveSortDir, debouncedSearch, effectiveRole]);

  const { data, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : usersListKey(params),
    () => actions.listUsers(params),
  );

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

  const allUsers = data?.users ?? [];
  const stats = useMemo(() => ({
    total: data?.total ?? 0,
    adminsInPage: allUsers.filter((u) => u.role === "admin").length,
    bannedInPage: allUsers.filter((u) => u.banned).length,
    unverifiedInPage: allUsers.filter((u) => !u.emailVerified).length,
  }), [allUsers, data?.total]);
  const displayedUsers =
    effectiveStatus === "all"
      ? allUsers
      : effectiveStatus === "active"
        ? allUsers.filter((u) => !u.banned)
        : allUsers.filter((u) => u.banned);

  function handleRetry() {
    if (onRetry) { onRetry(); return; }
    void mutate();
  }

  async function handleCreateConfirm(formData: FormData) {
    setCreateError(undefined);
    try {
      const password = String(formData.get("password") ?? "");
      const name = String(formData.get("name") ?? "");
      await actions.createUser({
        name,
        email: String(formData.get("email") ?? ""),
        password: password || undefined,
        role: String(formData.get("role") ?? "user"),
      });
      await mutate();
      toast.success("User created", `${name || "The account"} can now sign in.`);
      return true;
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
      return false;
    }
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setCreateError(undefined);
    }
  }

  function renderTable() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={handleRetry} />;
    if (displayedUsers.length === 0) {
      if (debouncedSearch) {
        return (
          <EmptyState
            message="No users match your search"
            cta="Clear search"
            onCta={() => handleSearchChange("")}
          />
        );
      }
      if (effectiveRole !== "all" || effectiveStatus !== "all") {
        return (
          <EmptyState
            message="No users matching filters"
            cta="Clear filters"
            onCta={() => { handleRoleFilterChange("all"); handleStatusFilterChange("all"); }}
          />
        );
      }
      return (
        <EmptyState
          message="No users found"
          cta="Create User"
          onCta={() => setCreateOpen(true)}
        />
      );
    }
    return (
      <DataTable<User>
        columns={columns}
        rows={displayedUsers}
        getRowKey={(u) => u.id}
        onRowClick={(u) => onRowClick?.(u.id)}
        sortBy={effectiveSortBy}
        sortDirection={effectiveSortDir}
        onSort={handleSort}
        pagination={
          data
            ? { total: data.total, limit: pageLimit, offset: effectiveOffset, onChange: handlePageChange }
            : undefined
        }
      />
    );
  }

  return (
    <Stack gap="md">
      <PageIntro
        title="Users"
        description="People who can sign in. Create accounts, assign roles, verify emails, and ban access."
        info="Each user is a local account in this identity provider. The Role column controls admin access to this console; Status shows whether an account is active or banned, and banning revokes active sessions immediately. Search by name or email, then open a row to manage that user's sessions and details."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)} iconName="Plus">
            New User
          </Button>
        }
      />
      <StatGroup columns={4}>
        <Stat title="Total" value={showLoading ? "…" : stats.total} description="matching users" tone="primary" />
        <Stat title="Admins" value={showLoading ? "…" : stats.adminsInPage} description="in loaded page" />
        <Stat title="Banned" value={showLoading ? "…" : stats.bannedInPage} description="in loaded page" tone={stats.bannedInPage > 0 ? "error" : "success"} />
        <Stat title="Unverified" value={showLoading ? "…" : stats.unverifiedInPage} description="in loaded page" tone={stats.unverifiedInPage > 0 ? "warning" : "success"} />
      </StatGroup>
      <Panel>
        <Stack gap="sm">
          <Inline gap="sm" justify="between" wrap>
            <SearchInput
              grow
              placeholder="Search name or email…"
              value={effectiveSearch}
              onChange={handleSearchChange}
            />
            <Inline gap="sm">
              <FilterDropdown
                label="Role"
                options={roleFilterOptions}
                value={effectiveRole}
                onChange={handleRoleFilterChange}
                className="hidden lg:block"
              />
              <FilterDropdown
                label="Status"
                options={statusFilterOptions}
                value={effectiveStatus}
                onChange={handleStatusFilterChange}
                className="hidden lg:block"
              />
              <MobileFilterMenu
                groups={[
                  {
                    key: "role",
                    label: "Role",
                    options: roleFilterOptions,
                    value: effectiveRole,
                    onChange: handleRoleFilterChange,
                  },
                  {
                    key: "status",
                    label: "Status",
                    options: statusFilterOptions,
                    value: effectiveStatus,
                    onChange: handleStatusFilterChange,
                  },
                ]}
              />
            </Inline>
          </Inline>
        </Stack>
      </Panel>
      <Panel padding={displayedUsers.length > 0 && !showLoading && !showError ? "none" : "md"}>
        {renderTable()}
      </Panel>
      <ConfirmDialog
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        title="Create User"
        description="Create a local user record. Leave password blank only when another sign-in or password setup flow is available."
        confirmLabel="Create"
        error={createError}
        onConfirm={handleCreateConfirm}
      >
        <TextInput label="Name" name="name" required />
        <TextInput label="Email" name="email" type="email" required />
        <TextInput label="Password" name="password" type="password" autoComplete="new-password" />
        <RadioGroup
          title="Role"
          name="role"
          options={roleOptions}
          defaultValue="user"
        />
      </ConfirmDialog>
    </Stack>
  );
}
