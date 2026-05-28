"use client";

import { useState, useEffect } from "react";
import {
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  FilterDropdown,
  Inline,
  Panel,
  Skeleton,
  Stack,
  Text,
  TextInput,
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
  type Member,
} from "../../_actions/organizations";
import { getUser as getUserAction, type User } from "../../_actions/users";

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

type EnrichedTeamMember = TeamMember & { user: User | null };

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
  const [teams, setTeams] = useState<Team[]>([]);
  const [orgMembers, setOrgMembers] = useState<Member[]>([]);
  const [userCache, setUserCache] = useState<Map<string, User>>(new Map());
  const [memberCounts, setMemberCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [expandedMembers, setExpandedMembers] = useState<EnrichedTeamMember[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();

  const [renameTarget, setRenameTarget] = useState<Team | null>(null);
  const [renameError, setRenameError] = useState<string | undefined>();

  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const [removeMemberTarget, setRemoveMemberTarget] = useState<EnrichedTeamMember | null>(null);
  const [removeMemberError, setRemoveMemberError] = useState<string | undefined>();

  async function enrichUsers(userIds: string[], currentCache: Map<string, User>): Promise<Map<string, User>> {
    const missing = userIds.filter((id) => !currentCache.has(id));
    if (missing.length === 0) return currentCache;
    const fetched = await Promise.all(missing.map((id) => actions.getUser(id).then((r) => r.user).catch(() => null)));
    const next = new Map(currentCache);
    missing.forEach((id, i) => { if (fetched[i]) next.set(id, fetched[i]!); });
    return next;
  }

  useEffect(() => {
    if (loadingOverride || errorOverride) return;
    setIsLoading(true);
    setFetchError(undefined);
    let cancelled = false;
    void (async () => {
      try {
        const [fetchedTeams, members] = await Promise.all([
          actions.listTeams(orgId),
          actions.listMembers(orgId),
        ]);
        const counts = await Promise.all(
          fetchedTeams.map((t) => actions.listTeamMembers(t.id).then((tms) => tms.length).catch(() => 0)),
        );
        const countMap = new Map(fetchedTeams.map((t, i) => [t.id, counts[i]]));
        const allUserIds = [...new Set(members.map((m) => m.userId))];
        const newCache = await enrichUsers(allUserIds, new Map());
        if (!cancelled) {
          setTeams(fetchedTeams);
          setOrgMembers(members);
          setMemberCounts(countMap);
          setUserCache(newCache);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load teams");
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [actions, orgId, loadingOverride, errorOverride, fetchKey]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  async function handleExpandTeam(team: Team) {
    if (expandedTeamId === team.id) { setExpandedTeamId(null); return; }
    setExpandedTeamId(team.id);
    setExpandLoading(true);
    try {
      const tms = await actions.listTeamMembers(team.id);
      const ids = tms.map((tm) => tm.userId);
      const cache = await enrichUsers(ids, userCache);
      setUserCache(cache);
      setExpandedMembers(tms.map((tm) => Object.assign({}, tm, { user: cache.get(tm.userId) ?? null })));
    } finally {
      setExpandLoading(false);
    }
  }

  async function handleAddMember(teamId: string, userId: string) {
    try {
      await actions.addTeamMember(teamId, userId, orgId);
      const tms = await actions.listTeamMembers(teamId);
      const ids = tms.map((tm) => tm.userId);
      const cache = await enrichUsers(ids, userCache);
      setUserCache(cache);
      setExpandedMembers(tms.map((tm) => Object.assign({}, tm, { user: cache.get(tm.userId) ?? null })));
      setMemberCounts((prev) => new Map(prev).set(teamId, tms.length));
    } catch { /* surface via alert if needed */ }
  }

  async function handleCreate(formData: FormData) {
    setCreateError(undefined);
    try {
      const name = String(formData.get("name") ?? "").trim();
      await actions.createTeam(name, orgId);
      setFetchKey((k) => k + 1);
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
      const name = String(formData.get("name") ?? "").trim();
      await actions.updateTeam(renameTarget.id, name);
      setFetchKey((k) => k + 1);
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
      await actions.removeTeam(deleteTarget.id);
      if (expandedTeamId === deleteTarget.id) setExpandedTeamId(null);
      setFetchKey((k) => k + 1);
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
      await actions.removeTeamMember(expandedTeamId, removeMemberTarget.userId, orgId);
      const tms = await actions.listTeamMembers(expandedTeamId);
      setExpandedMembers(tms.map((tm) => ({ ...tm, user: userCache.get(tm.userId) ?? null })));
      setMemberCounts((prev) => new Map(prev).set(expandedTeamId, tms.length));
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
  const addMemberOptions = eligibleForAdd.map((m) => ({
    value: m.userId,
    label: userCache.get(m.userId)?.name ?? m.userId.slice(0, 12),
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
            onClick={() => handleExpandTeam(t)}
          />
          <Button
            size="sm"
            variant="secondary"
            iconName="Pencil"
            ariaLabel="Rename team"
            onClick={() => { setRenameError(undefined); setRenameTarget(t); }}
          />
          <Button
            variant="danger"
            size="sm"
            iconName="Trash2"
            ariaLabel="Delete team"
            onClick={() => { setDeleteError(undefined); setDeleteTarget(t); }}
          />
        </Inline>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <Inline justify="between">
        <Text variant="h3">Teams ({teams.length})</Text>
        <Button variant="primary" onClick={() => { setCreateError(undefined); setCreateOpen(true); }}>
          + Create Team
        </Button>
      </Inline>

      {showLoading && <Skeleton rows={4} />}
      {!showLoading && showError && (
        <ErrorAlert message={showError} onRetry={() => setFetchKey((k) => k + 1)} />
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
                  {addMemberOptions.length > 0 && (
                    <FilterDropdown
                      label="Add Member"
                      options={[{ value: "", label: "— select —" }, ...addMemberOptions]}
                      value=""
                      onChange={(userId) => {
                        if (userId && expandedTeamId) void handleAddMember(expandedTeamId, userId);
                      }}
                    />
                  )}
                </Inline>
                {expandLoading && <Skeleton rows={2} />}
                {!expandLoading && expandedMembers.length === 0 && (
                  <EmptyState message="No members in this team" />
                )}
                {!expandLoading && expandedMembers.map((tm) => (
                  <Inline key={tm.id} justify="between">
                    <Inline gap="sm">
                      <Text variant="body">{tm.user?.name ?? tm.userId.slice(0, 12)}</Text>
                      <Text variant="caption">{tm.user?.email ?? ""}</Text>
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
        confirmLabel="Save"
        error={renameError}
        onConfirm={handleRename}
      >
        <TextInput label="Team Name" name="name" defaultValue={renameTarget?.name ?? ""} />
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
        description={`Remove ${removeMemberTarget?.user?.name ?? "member"} from ${expandedTeam?.name ?? "team"}?`}
        confirmLabel="Remove"
        variant="danger"
        error={removeMemberError}
        onConfirm={handleRemoveMember}
      />
    </Stack>
  );
}
