"use client";

import { useState, useEffect, useMemo } from "react";
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
  Skeleton,
  Stack,
  TextInput,
} from "@id/ui";
import {
  listMembers as listMembersAction,
  updateMemberRole as updateMemberRoleAction,
  removeMember as removeMemberAction,
  inviteMember as inviteMemberAction,
  type Member,
} from "../../_actions/organizations";
import { getUser as getUserAction, type User } from "../../_actions/users";

const defaultActions = {
  listMembers: listMembersAction,
  updateMemberRole: updateMemberRoleAction,
  removeMember: removeMemberAction,
  inviteMember: inviteMemberAction,
  getUser: getUserAction,
};

const roleFilterOptions = [
  { value: "all", label: "All" },
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

const memberRoleOptions = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

const roleBadgeTone = (role: string): "primary" | "neutral" | "warning" => {
  if (role === "owner") return "warning";
  if (role === "admin") return "primary";
  return "neutral";
};

type EnrichedMember = Member & { user: User | null };

type OrgMembersContentProps = {
  orgId: string;
  orgName?: string;
  roleFilter?: string;
  onRoleFilterChange?: (v: string) => void;
  loading?: boolean;
  error?: string;
  actions?: typeof defaultActions;
};

export function OrganizationMembersContent({
  orgId,
  orgName,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
  ...props
}: OrgMembersContentProps) {
  const [enriched, setEnriched] = useState<EnrichedMember[]>([]);
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  const [internalRoleFilter, setInternalRoleFilter] = useState("all");
  const effectiveRoleFilter = props.roleFilter ?? internalRoleFilter;
  const handleRoleFilter = props.onRoleFilterChange ?? setInternalRoleFilter;

  const [changeRoleTarget, setChangeRoleTarget] = useState<EnrichedMember | null>(null);
  const [selectedRole, setSelectedRole] = useState("member");
  const [changeRoleError, setChangeRoleError] = useState<string | undefined>();

  const [removeTarget, setRemoveTarget] = useState<EnrichedMember | null>(null);
  const [removeError, setRemoveError] = useState<string | undefined>();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteError, setInviteError] = useState<string | undefined>();

  useEffect(() => {
    if (loadingOverride || errorOverride) return;
    setIsLoading(true);
    setFetchError(undefined);
    let cancelled = false;
    void (async () => {
      try {
        const members = await actions.listMembers(orgId);
        const uniqueIds = [...new Set(members.map((m) => m.userId))];
        const users = await Promise.all(uniqueIds.map((id) => actions.getUser(id).then((r) => r.user).catch(() => null)));
        const userMap = new Map<string, User | null>(uniqueIds.map((id, i) => [id, users[i]]));
        if (!cancelled) {
          setEnriched(members.map((m) => Object.assign({}, m, { user: userMap.get(m.userId) ?? null })));
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load members");
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [actions, orgId, loadingOverride, errorOverride, fetchKey]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  const filteredMembers = useMemo(
    () => effectiveRoleFilter === "all" ? enriched : enriched.filter((m) => m.role === effectiveRoleFilter),
    [enriched, effectiveRoleFilter],
  );

  const owners = useMemo(() => enriched.filter((m) => m.role === "owner"), [enriched]);

  const columns: DataTableColumn<EnrichedMember>[] = [
    {
      key: "name",
      label: "Name",
      render: (m) => m.user?.name ?? m.userId.slice(0, 12) + "…",
    },
    {
      key: "email",
      label: "Email",
      render: (m) => m.user?.email ?? "—",
    },
    {
      key: "role",
      label: "Role",
      render: (m) => <Badge tone={roleBadgeTone(m.role)}>{m.role}</Badge>,
    },
    {
      key: "createdAt",
      label: "Joined",
      sortable: true,
      render: (m) => new Date(m.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      render: (m) => {
        const isLastOwner = m.role === "owner" && owners.length === 1;
        return (
          <Inline gap="sm">
            <Button
              size="sm"
              variant="secondary"
              iconName="Pencil"
              ariaLabel="Change role"
              onClick={() => { setChangeRoleError(undefined); setSelectedRole(m.role); setChangeRoleTarget(m); }}
            />
            <Button
              variant="danger"
              size="sm"
              iconName="Trash2"
              ariaLabel="Remove member"
              disabled={isLastOwner}
              onClick={() => { setRemoveError(undefined); setRemoveTarget(m); }}
            />
          </Inline>
        );
      },
    },
  ];

  async function handleChangeRole(formData: FormData) {
    if (!changeRoleTarget) return false;
    setChangeRoleError(undefined);
    try {
      const role = String(formData.get("role") ?? selectedRole);
      await actions.updateMemberRole(changeRoleTarget.id, role);
      setFetchKey((k) => k + 1);
      return true;
    } catch (err: unknown) {
      setChangeRoleError(err instanceof Error ? err.message : "Failed to change role");
      return false;
    }
  }

  async function handleRemove() {
    if (!removeTarget) return false;
    setRemoveError(undefined);
    try {
      await actions.removeMember(removeTarget.id, orgId);
      setFetchKey((k) => k + 1);
      return true;
    } catch (err: unknown) {
      setRemoveError(err instanceof Error ? err.message : "Failed to remove member");
      return false;
    }
  }

  async function handleInvite(formData: FormData) {
    setInviteError(undefined);
    try {
      const email = String(formData.get("email") ?? "").trim();
      const role = String(formData.get("role") ?? inviteRole);
      await actions.inviteMember(orgId, email, role);
      setFetchKey((k) => k + 1);
      return true;
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite");
      return false;
    }
  }

  function renderTable() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => setFetchKey((k) => k + 1)} />;
    if (filteredMembers.length === 0) {
      return effectiveRoleFilter !== "all"
        ? <EmptyState message="No members with this role" />
        : <EmptyState message="No members" />;
    }
    return (
      <DataTable<EnrichedMember>
        columns={columns}
        rows={filteredMembers}
        getRowKey={(m) => m.id}
      />
    );
  }

  return (
    <Stack gap="md">
      <Inline justify="between">
        <FilterDropdown
          label="Role"
          options={roleFilterOptions}
          value={effectiveRoleFilter}
          onChange={handleRoleFilter}
        />
        <Button variant="primary" onClick={() => { setInviteRole("member"); setInviteError(undefined); setInviteOpen(true); }}>
          + Invite Member
        </Button>
      </Inline>

      <Panel padding={filteredMembers.length > 0 && !showLoading && !showError ? "none" : "md"}>
        {renderTable()}
      </Panel>

      {/* Change Role */}
      <ConfirmDialog
        open={Boolean(changeRoleTarget)}
        onOpenChange={(o) => { if (!o) { setChangeRoleTarget(null); setChangeRoleError(undefined); } }}
        title={`Change role for ${changeRoleTarget?.user?.name ?? "member"}`}
        confirmLabel="Save"
        error={changeRoleError}
        onConfirm={handleChangeRole}
      >
        <RadioGroup
          title="Role"
          name="role"
          options={memberRoleOptions}
          value={selectedRole}
          onChange={setSelectedRole}
        />
      </ConfirmDialog>

      {/* Remove Member */}
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => { if (!o) { setRemoveTarget(null); setRemoveError(undefined); } }}
        title={`Remove ${removeTarget?.user?.name ?? "member"}`}
        description={`This will remove ${removeTarget?.user?.name ?? "this member"} from ${orgName ?? "the organization"}.`}
        confirmLabel="Remove"
        variant="danger"
        error={removeError}
        onConfirm={handleRemove}
      />

      {/* Invite Member */}
      <ConfirmDialog
        open={inviteOpen}
        onOpenChange={(o) => { setInviteOpen(o); if (!o) setInviteError(undefined); }}
        title="Invite Member"
        confirmLabel="Send Invite"
        error={inviteError}
        onConfirm={handleInvite}
      >
        <TextInput label="Email" name="email" type="email" required />
        <RadioGroup
          title="Role"
          name="role"
          options={memberRoleOptions}
          value={inviteRole}
          onChange={setInviteRole}
        />
      </ConfirmDialog>
    </Stack>
  );
}
