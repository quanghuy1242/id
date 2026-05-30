"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import {
  Alert,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  Inline,
  InfoPopover,
  Panel,
  ResourceSelector,
  type ResourceOption,
  Skeleton,
  Stack,
  Text,
  TextInput,
  toast,
} from "@id/ui";
import {
  listTeams as listTeamsAction,
  listTeamMembers as listTeamMembersAction,
  listMembers as listMembersAction,
  createTeam as createTeamAction,
  updateTeam as updateTeamAction,
  removeTeam as removeTeamAction,
  addTeamMember as addTeamMemberAction,
  removeTeamMember as removeTeamMemberAction,
  type Team,
  type TeamMember,
} from "../../_actions/organizations";
import { getUser as getUserAction } from "../../_actions/users";
import { orgTeamsKey } from "@/app/admin/_data/swr-keys";
import { useUsersByIds } from "@/app/admin/_data/use-users-by-ids";

const defaultActions = {
  listTeams: listTeamsAction,
  listTeamMembers: listTeamMembersAction,
  listMembers: listMembersAction,
  createTeam: createTeamAction,
  updateTeam: updateTeamAction,
  removeTeam: removeTeamAction,
  addTeamMember: addTeamMemberAction,
  removeTeamMember: removeTeamMemberAction,
  getUser: getUserAction,
};

type OrgTeamsContentProps = {
  orgId: string;
  loading?: boolean;
  error?: string;
  actions?: typeof defaultActions;
};

export function OrganizationTeamsContent({
  orgId,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: OrgTeamsContentProps) {
  // One keyed fetch for the whole teams bundle: teams, org members, and the
  // per-team member counts. Cross-navigation cached and deduplicated by SWR.
  const { data, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : orgTeamsKey(orgId),
    async () => {
      const [teams, orgMembers] = await Promise.all([
        actions.listTeams(orgId),
        actions.listMembers(orgId),
      ]);
      const counts = await Promise.all(
        teams.map((t) => actions.listTeamMembers(t.id).then((tms) => tms.length).catch(() => 0)),
      );
      return { teams, orgMembers, memberCounts: new Map(teams.map((t, i) => [t.id, counts[i]])) };
    },
  );

  const teams = data?.teams ?? [];
  const orgMembers = data?.orgMembers ?? [];
  const memberCounts = data?.memberCounts ?? new Map<string, number>();

  // All names resolve through the shared user cache (team members ⊆ org members).
  const { usersById, isLoading: usersLoading } = useUsersByIds(
    orgMembers.map((m) => m.userId),
    actions.getUser,
  );

  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [expandedMembers, setExpandedMembers] = useState<TeamMember[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);
  const expandRequestRef = useRef(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const [addMemberError, setAddMemberError] = useState<string | undefined>();
  const [addMemberValue, setAddMemberValue] = useState("");

  const [renameTarget, setRenameTarget] = useState<Team | null>(null);
  const [renameError, setRenameError] = useState<string | undefined>();

  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const [removeMemberTarget, setRemoveMemberTarget] = useState<TeamMember | null>(null);
  const [removeMemberError, setRemoveMemberError] = useState<string | undefined>();

  const showLoading = loadingOverride ?? (isLoading || (orgMembers.length > 0 && usersLoading));
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

  const userName = (userId: string) => usersById.get(userId)?.name ?? userId.slice(0, 12);

  async function handleExpandTeam(team: Team) {
    expandRequestRef.current += 1;
    const requestId = expandRequestRef.current;
    if (expandedTeamId === team.id) {
      setExpandedTeamId(null);
      setExpandedMembers([]);
      setAddMemberValue("");
      setExpandLoading(false);
      return;
    }
    setExpandedTeamId(team.id);
    setExpandedMembers([]);
    setAddMemberError(undefined);
    setAddMemberValue("");
    setExpandLoading(true);
    try {
      const members = await actions.listTeamMembers(team.id);
      if (expandRequestRef.current === requestId) setExpandedMembers(members);
    } finally {
      if (expandRequestRef.current === requestId) setExpandLoading(false);
    }
  }

  async function handleAddMember(teamId: string, userId: string) {
    setAddMemberError(undefined);
    try {
      await actions.addTeamMember(teamId, userId, orgId);
      setExpandedMembers(await actions.listTeamMembers(teamId));
      setAddMemberValue("");
      await mutate();
      toast.success("Added to team", `${userName(userId)} now belongs to this team.`);
    } catch (err: unknown) {
      setAddMemberError(err instanceof Error ? err.message : "Failed to add team member");
    }
  }

  async function handleCreate(formData: FormData) {
    setCreateError(undefined);
    try {
      const name = String(formData.get("name") ?? "").trim();
      await actions.createTeam(name, orgId);
      await mutate();
      toast.success("Team created", `Add members to ${name || "the team"} from its row.`);
      return true;
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create team");
      return false;
    }
  }

  async function handleRename(formData: FormData) {
    if (!renameTarget) return false;
    setRenameError(undefined);
    try {
      await actions.updateTeam(renameTarget.id, String(formData.get("name") ?? "").trim());
      await mutate();
      toast.success("Team renamed");
      return true;
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : "Failed to rename team");
      return false;
    }
  }

  async function handleDeleteTeam() {
    if (!deleteTarget) return false;
    setDeleteError(undefined);
    try {
      const removedName = deleteTarget.name;
      await actions.removeTeam(deleteTarget.id);
      if (expandedTeamId === deleteTarget.id) setExpandedTeamId(null);
      await mutate();
      toast.success("Team deleted", `${removedName} was removed. Members keep their organization membership.`);
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete team");
      return false;
    }
  }

  async function handleRemoveMember() {
    if (!removeMemberTarget || !expandedTeamId) return false;
    setRemoveMemberError(undefined);
    try {
      const removedName = userName(removeMemberTarget.userId);
      await actions.removeTeamMember(expandedTeamId, removeMemberTarget.userId, orgId);
      setExpandedMembers(await actions.listTeamMembers(expandedTeamId));
      await mutate();
      toast.success("Removed from team", `${removedName} still belongs to the organization.`);
      return true;
    } catch (err: unknown) {
      setRemoveMemberError(err instanceof Error ? err.message : "Failed to remove member");
      return false;
    }
  }

  const expandedTeam = teams.find((t) => t.id === expandedTeamId);
  const eligibleForAdd = orgMembers.filter(
    (m) => !expandedMembers.some((em) => em.userId === m.userId),
  );
  const addMemberOptions: ResourceOption[] = eligibleForAdd.map((m) => ({
    id: m.userId,
    label: userName(m.userId),
    sublabel: usersById.get(m.userId)?.email ?? undefined,
    image: usersById.get(m.userId)?.image ?? undefined,
    badge: m.role,
  }));

  const columns: DataTableColumn<Team>[] = [
    { key: "name", label: "Name", sortable: true },
    {
      key: "memberCount",
      label: "Members",
      render: (t) => String(memberCounts.get(t.id) ?? "…"),
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      render: (t) => new Date(t.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      render: (t) => (
        <Inline gap="xs">
          <Button
            size="sm"
            variant="secondary"
            iconName={expandedTeamId === t.id ? "ChevronDown" : "ChevronRight"}
            ariaLabel={expandedTeamId === t.id ? "Collapse" : "Expand"}
            tooltip={expandedTeamId === t.id ? "Hide members" : "View & manage members"}
            onClick={() => handleExpandTeam(t)}
          />
          <Button
            size="sm"
            variant="secondary"
            iconName="Pencil"
            ariaLabel="Rename team"
            tooltip="Rename team"
            onClick={() => { setRenameError(undefined); setRenameTarget(t); }}
          />
          <Button
            variant="danger"
            size="sm"
            iconName="Trash2"
            ariaLabel="Delete team"
            tooltip="Delete team"
            onClick={() => { setDeleteError(undefined); setDeleteTarget(t); }}
          />
        </Inline>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <Inline justify="between">
        <Inline gap="xs" align="center">
          <Text variant="h3">Teams ({teams.length})</Text>
          <InfoPopover title="Teams" label="About teams">
            Teams are sub-groups within the organization for grouping members — for example by department or project. A team only contains people who are already organization members, and removing someone from a team does not remove them from the organization.
          </InfoPopover>
        </Inline>
        <Button variant="primary" iconName="Plus" onClick={() => { setCreateError(undefined); setCreateOpen(true); }}>
          Create Team
        </Button>
      </Inline>

      {showLoading && <Skeleton rows={4} />}
      {!showLoading && showError && (
        <ErrorAlert message={showError} onRetry={() => void mutate()} />
      )}

      {!showLoading && !showError && (
        <>
          <Panel padding={teams.length > 0 ? "none" : "md"}>
            {teams.length === 0
              ? <EmptyState message="No teams yet" cta="Create Team" onCta={() => setCreateOpen(true)} />
              : (
                <DataTable<Team>
                  columns={columns}
                  rows={teams}
                  getRowKey={(t) => t.id}
                />
              )}
          </Panel>

          {expandedTeam && (
            <Panel tone="muted">
              <Stack gap="md">
                <Inline justify="between">
                  <Text variant="h3">{expandedTeam.name} · {expandedMembers.length} members</Text>
                  {!expandLoading && addMemberOptions.length > 0 && (
                    <ResourceSelector
                      kind="member"
                      value={addMemberValue}
                      variant="menu"
                      width="compact"
                      label={`Add member to ${expandedTeam.name}`}
                      placeholder="Add member…"
                      source={{ mode: "sync", items: addMemberOptions }}
                      excludeIds={expandedMembers.map((member) => member.userId)}
                      onChange={(next) => {
                        const userId = Array.isArray(next) ? next[0] : next;
                        setAddMemberValue(userId);
                        if (userId && expandedTeamId) void handleAddMember(expandedTeamId, userId);
                      }}
                    />
                  )}
                </Inline>
                {addMemberError && <Alert tone="error">{addMemberError}</Alert>}
                {expandLoading && <Skeleton rows={2} />}
                {!expandLoading && expandedMembers.length === 0 && (
                  <EmptyState message="No members in this team" />
                )}
                {!expandLoading && expandedMembers.map((tm) => (
                  <Inline key={tm.id} justify="between">
                    <Inline gap="sm">
                      <Text variant="body">{userName(tm.userId)}</Text>
                      <Text variant="caption">{usersById.get(tm.userId)?.email ?? ""}</Text>
                    </Inline>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => { setRemoveMemberError(undefined); setRemoveMemberTarget(tm); }}
                    >
                      Remove
                    </Button>
                  </Inline>
                ))}
              </Stack>
            </Panel>
          )}
        </>
      )}

      {/* Create Team */}
      <ConfirmDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateError(undefined); }}
        title="Create Team"
        description="Teams group existing organization members. Add people after the team is created."
        confirmLabel="Create"
        error={createError}
        onConfirm={handleCreate}
      >
        <TextInput label="Team Name" name="name" required />
      </ConfirmDialog>

      {/* Rename Team */}
      <ConfirmDialog
        open={Boolean(renameTarget)}
        onOpenChange={(o) => { if (!o) { setRenameTarget(null); setRenameError(undefined); } }}
        title="Rename Team"
        description="Renaming a team keeps its members and organization membership unchanged."
        confirmLabel="Save"
        error={renameError}
        onConfirm={handleRename}
      >
        <TextInput label="Team Name" name="name" defaultValue={renameTarget?.name ?? ""} required />
      </ConfirmDialog>

      {/* Delete Team */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(undefined); } }}
        title={`Delete team ${deleteTarget?.name ?? ""}`}
        description={`${memberCounts.get(deleteTarget?.id ?? "") ?? 0} team members will be removed from the team (org membership is preserved).`}
        confirmLabel="Delete"
        variant="danger"
        error={deleteError}
        onConfirm={handleDeleteTeam}
      />

      {/* Remove Team Member */}
      <ConfirmDialog
        open={Boolean(removeMemberTarget)}
        onOpenChange={(o) => { if (!o) { setRemoveMemberTarget(null); setRemoveMemberError(undefined); } }}
        title="Remove Member"
        description={`Remove ${removeMemberTarget ? userName(removeMemberTarget.userId) : "member"} from ${expandedTeam?.name ?? "team"}?`}
        confirmLabel="Remove"
        variant="danger"
        error={removeMemberError}
        onConfirm={handleRemoveMember}
      />
    </Stack>
  );
}
