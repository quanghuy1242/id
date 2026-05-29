"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
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
  InfoPopover,
  Panel,
  RadioGroup,
  Skeleton,
  Stack,
  Text,
  TextInput,
  toast,
} from "@id/ui";
import {
  listMembers as listMembersAction,
  updateMemberRole as updateMemberRoleAction,
  removeMember as removeMemberAction,
  inviteMember as inviteMemberAction,
  type Member,
} from "../../_actions/organizations";
import { getUser as getUserAction, type User } from "../../_actions/users";
import { orgMembersKey } from "@/app/admin/_data/swr-keys";
import { useUsersByIds } from "@/app/admin/_data/use-users-by-ids";

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

  const { data: members, isLoading: membersLoading, error: membersError, mutate } = useSWR(
    loadingOverride || errorOverride ? null : orgMembersKey(orgId),
    () => actions.listMembers(orgId),
  );

  // Per-member user lookups go through the shared user cache so ids already
  // seen on the user-detail page (or elsewhere) resolve without a network call.
  const { usersById, isLoading: usersLoading } = useUsersByIds(
    (members ?? []).map((m) => m.userId),
    actions.getUser,
  );

  const enriched: EnrichedMember[] = useMemo(
    () => (members ?? []).map((m) => Object.assign({}, m, { user: usersById.get(m.userId) ?? null })),
    [members, usersById],
  );

  const showLoading = loadingOverride ?? (membersLoading || (Boolean(members?.length) && usersLoading));
  const showError = errorOverride ?? (membersError instanceof Error ? membersError.message : membersError ? String(membersError) : undefined);

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
              tooltip="Change role"
              onClick={() => { setChangeRoleError(undefined); setSelectedRole(m.role); setChangeRoleTarget(m); }}
            />
            <Button
              variant="danger"
              size="sm"
              iconName="Trash2"
              ariaLabel="Remove member"
              tooltip={isLastOwner ? "Add another owner first" : "Remove from organization"}
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
      if (changeRoleTarget.role === "owner" && role !== "owner" && owners.length === 1) {
        setChangeRoleError("Add another owner before changing the last owner's role");
        return false;
      }
      await actions.updateMemberRole(changeRoleTarget.id, role);
      await mutate();
      toast.success("Role updated", `${changeRoleTarget.user?.name ?? "Member"} is now ${role}.`);
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
      await mutate();
      toast.success("Member removed", `${removeTarget.user?.name ?? "The member"} was removed from ${orgName ?? "the organization"}.`);
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
      await mutate();
      toast.success("Invitation sent", `${email} was invited as ${role}.`);
      return true;
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite");
      return false;
    }
  }

  function renderTable() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
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
      <Inline gap="xs" align="center">
        <Text variant="caption">
          People who belong to this organization. Invite by email and assign a role.
        </Text>
        <InfoPopover title="Roles" label="About member roles">
          Owner can manage billing, members, and delete the organization; Admin manages members and teams; Member has standard access. Keep at least one Owner — the last owner cannot be removed or demoted until another owner is added.
        </InfoPopover>
      </Inline>
      <Inline justify="between">
        <FilterDropdown
          label="Role"
          options={roleFilterOptions}
          value={effectiveRoleFilter}
          onChange={handleRoleFilter}
        />
        <Button
          variant="primary"
          iconName="Plus"
          onClick={() => { setInviteRole("member"); setInviteError(undefined); setInviteOpen(true); }}
        >
          Invite Member
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
        description="Owners can manage billing and organization deletion. Keep at least one owner on the organization."
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
        description={`Send an invitation to join ${orgName ?? "this organization"}. Assign the lowest role that fits the work.`}
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
