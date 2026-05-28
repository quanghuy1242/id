"use client";

import { useState, useEffect } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  FilterDropdown,
  Inline,
  Panel,
  RadioGroup,
  SearchInput,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@id/ui";
import { listUsers, createUser, type User } from "../../_actions/users";

const pageLimit = 25;

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
  { key: "name", label: "Name", sortable: true },
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
        <Badge tone="success" size="sm">Verified</Badge>
      ) : (
        <Badge tone="warning" size="sm">Unverified</Badge>
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
};

type FetchedData = {
  users: User[];
  total: number;
  limit: number;
  offset: number;
};

export function UsersListContent({
  loading: loadingOverride,
  error: errorOverride,
  onRetry,
  onRowClick,
  ...props
}: UsersListContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalRole, setInternalRole] = useState("all");
  const [internalStatus, setInternalStatus] = useState("all");
  const [internalSortBy, setInternalSortBy] = useState("createdAt");
  const [internalSortDir, setInternalSortDir] = useState<"asc" | "desc">("desc");
  const [internalOffset, setInternalOffset] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [data, setData] = useState<FetchedData | null>(null);
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("user");
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

  useEffect(() => {
    if (loadingOverride || errorOverride) return;

    setIsLoading(true);
    setFetchError(undefined);

    const params = {
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
    };

    let cancelled = false;
    void (async () => {
      try {
        const res = await listUsers(params);
        if (!cancelled) { setData(res); setIsLoading(false); }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load users");
          setIsLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [loadingOverride, errorOverride, debouncedSearch, effectiveRole, effectiveSortBy, effectiveSortDir, effectiveOffset, fetchKey]); // handlers are stable per render; no stale-closure risk here

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  const allUsers = data?.users ?? [];
  const displayedUsers =
    effectiveStatus === "all"
      ? allUsers
      : effectiveStatus === "active"
        ? allUsers.filter((u) => !u.banned)
        : allUsers.filter((u) => u.banned);

  function handleRetry() {
    if (onRetry) { onRetry(); return; }
    setFetchError(undefined);
    setFetchKey((k) => k + 1);
  }

  function handleCreateConfirm() {
    void (async () => {
      try {
        await createUser({
          name: createName,
          email: createEmail,
          password: createPassword || undefined,
          role: createRole,
        });
        setFetchKey((k) => k + 1);
      } catch (err: unknown) {
        setCreateError(err instanceof Error ? err.message : "Failed to create user");
      }
    })();
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("user");
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
      {createError && (
        <ErrorAlert message={createError} onRetry={() => setCreateError(undefined)} />
      )}
      <Panel>
        <Stack gap="sm">
          <Inline justify="between">
            <Text variant="h2">Users</Text>
            <Inline gap="sm">
              <FilterDropdown
                label="Role"
                options={roleFilterOptions}
                value={effectiveRole}
                onChange={handleRoleFilterChange}
              />
              <FilterDropdown
                label="Status"
                options={statusFilterOptions}
                value={effectiveStatus}
                onChange={handleStatusFilterChange}
              />
            </Inline>
          </Inline>
          <Inline gap="sm">
            <SearchInput
              grow
              placeholder="Search name or email…"
              value={effectiveSearch}
              onChange={handleSearchChange}
            />
            <Button variant="primary" onClick={() => setCreateOpen(true)} iconName="Plus">
              New
            </Button>
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
        confirmLabel="Create"
        onConfirm={handleCreateConfirm}
      >
        <TextInput label="Name" name="name" required onChange={setCreateName} />
        <TextInput label="Email" name="email" type="email" required onChange={setCreateEmail} />
        <TextInput label="Password" name="password" type="password" onChange={setCreatePassword} />
        <RadioGroup
          title="Role"
          name="role"
          options={roleOptions}
          value={createRole}
          onChange={setCreateRole}
        />
      </ConfirmDialog>
    </Stack>
  );
}
