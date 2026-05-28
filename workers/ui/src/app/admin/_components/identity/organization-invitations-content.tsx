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
  listInvitations as listInvsAction,
  inviteMember as inviteMemberAction,
  cancelInvitation as cancelInvitationAction,
  type Invitation,
} from "../../_actions/organizations";
import { getUser as getUserAction } from "../../_actions/users";

const defaultActions = {
  listInvitations: listInvsAction,
  inviteMember: inviteMemberAction,
  cancelInvitation: cancelInvitationAction,
  getUser: getUserAction,
};

const statusFilterOptions = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "expired", label: "Expired" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const inviteRoleOptions = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

const statusBadgeTone = (status: Invitation["status"]): "warning" | "success" | "error" | "neutral" => {
  if (status === "pending") return "warning";
  if (status === "accepted") return "success";
  if (status === "rejected") return "error";
  return "neutral";
};

type OrgInvsContentProps = {
  orgId: string;
  statusFilter?: string;
  onStatusFilterChange?: (v: string) => void;
  loading?: boolean;
  error?: string;
  actions?: typeof defaultActions;
};

export function OrganizationInvitationsContent({
  orgId,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
  ...props
}: OrgInvsContentProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviterNames, setInviterNames] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  const [internalStatus, setInternalStatus] = useState("all");
  const effectiveStatus = props.statusFilter ?? internalStatus;
  const handleStatusChange = props.onStatusFilterChange ?? setInternalStatus;

  const [resendTarget, setResendTarget] = useState<Invitation | null>(null);
  const [resendError, setResendError] = useState<string | undefined>();

  const [cancelTarget, setCancelTarget] = useState<Invitation | null>(null);
  const [cancelError, setCancelError] = useState<string | undefined>();

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
        const invs = await actions.listInvitations(orgId);
        const inviterIds = [...new Set(invs.map((i) => i.inviterId))];
        const names = await Promise.all(
          inviterIds.map((id) => actions.getUser(id).then((r) => r.user.name).catch(() => "—")),
        );
        const nameMap = new Map(inviterIds.map((id, i) => [id, names[i]]));
        if (!cancelled) {
          setInvitations(invs);
          setInviterNames(nameMap);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load invitations");
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [actions, orgId, loadingOverride, errorOverride, fetchKey]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  const filteredInvs = useMemo(
    () => effectiveStatus === "all" ? invitations : invitations.filter((i) => i.status === effectiveStatus),
    [invitations, effectiveStatus],
  );

  const columns: DataTableColumn<Invitation>[] = [
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (inv) => inv.email,
    },
    {
      key: "role",
      label: "Role",
      render: (inv) => inv.role,
    },
    {
      key: "teamId",
      label: "Team",
      render: (inv) => inv.teamId ? inv.teamId.slice(0, 12) + "…" : "—",
    },
    {
      key: "inviterId",
      label: "Invited By",
      render: (inv) => inviterNames.get(inv.inviterId) ?? "—",
    },
    {
      key: "expiresAt",
      label: "Expires",
      sortable: true,
      render: (inv) => new Date(inv.expiresAt).toLocaleDateString(),
    },
    {
      key: "status",
      label: "Status",
      render: (inv) => <Badge tone={statusBadgeTone(inv.status)} size="sm">{inv.status}</Badge>,
    },
    {
      key: "actions",
      label: "",
      render: (inv) => (
        <Inline gap="xs">
          {inv.status === "pending" && (
            <Button size="sm" onClick={() => { setResendError(undefined); setResendTarget(inv); }}>
              Resend
            </Button>
          )}
          {(inv.status === "pending" || inv.status === "expired") && (
            <Button variant="danger" size="sm" onClick={() => { setCancelError(undefined); setCancelTarget(inv); }}>
              Cancel
            </Button>
          )}
        </Inline>
      ),
    },
  ];

  async function handleResend() {
    if (!resendTarget) return false;
    setResendError(undefined);
    try {
      await actions.inviteMember(orgId, resendTarget.email, resendTarget.role, true);
      setFetchKey((k) => k + 1);
      return true;
    } catch (err: unknown) {
      setResendError(err instanceof Error ? err.message : "Failed to resend invitation");
      return false;
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return false;
    setCancelError(undefined);
    try {
      await actions.cancelInvitation(cancelTarget.id);
      setFetchKey((k) => k + 1);
      return true;
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : "Failed to cancel invitation");
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
    if (showLoading) return <Skeleton rows={4} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => setFetchKey((k) => k + 1)} />;
    if (filteredInvs.length === 0) {
      if (effectiveStatus !== "all") {
        return effectiveStatus === "pending"
          ? <EmptyState message="No pending invitations" />
          : <EmptyState message="No invitations with this status" />;
      }
      return <EmptyState message="No invitations yet" cta="Invite Member" onCta={() => setInviteOpen(true)} />;
    }
    return (
      <DataTable<Invitation>
        columns={columns}
        rows={filteredInvs}
        getRowKey={(inv) => inv.id}
      />
    );
  }

  return (
    <Stack gap="md">
      <Inline justify="between">
        <FilterDropdown
          label="Status"
          options={statusFilterOptions}
          value={effectiveStatus}
          onChange={handleStatusChange}
        />
        <Button
          variant="primary"
          iconName="Plus"
          onClick={() => { setInviteRole("member"); setInviteError(undefined); setInviteOpen(true); }}
        >
          Invite Member
        </Button>
      </Inline>

      <Panel padding={filteredInvs.length > 0 && !showLoading && !showError ? "none" : "md"}>
        {renderTable()}
      </Panel>

      {/* Resend */}
      <ConfirmDialog
        open={Boolean(resendTarget)}
        onOpenChange={(o) => { if (!o) { setResendTarget(null); setResendError(undefined); } }}
        title="Resend Invitation"
        description={`Resend invitation to ${resendTarget?.email ?? ""}?`}
        confirmLabel="Resend"
        error={resendError}
        onConfirm={handleResend}
      />

      {/* Cancel */}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelError(undefined); } }}
        title="Cancel Invitation"
        description={`Cancel invitation for ${cancelTarget?.email ?? ""}?`}
        confirmLabel="Yes, Cancel"
        variant="danger"
        error={cancelError}
        onConfirm={handleCancel}
      />

      {/* Invite */}
      <ConfirmDialog
        open={inviteOpen}
        onOpenChange={(o) => { setInviteOpen(o); if (!o) setInviteError(undefined); }}
        title="Invite Member"
        description="Invitations are sent by email. Use owner or admin only for people who need organization management access."
        confirmLabel="Send Invite"
        error={inviteError}
        onConfirm={handleInvite}
      >
        <TextInput label="Email" name="email" type="email" required />
        <RadioGroup
          title="Role"
          name="role"
          options={inviteRoleOptions}
          value={inviteRole}
          onChange={setInviteRole}
        />
      </ConfirmDialog>
    </Stack>
  );
}
