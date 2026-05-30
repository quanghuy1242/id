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
  listInvitations as listInvsAction,
  inviteMember as inviteMemberAction,
  cancelInvitation as cancelInvitationAction,
  type Invitation,
} from "../../_actions/organizations";
import { getUser as getUserAction } from "../../_actions/users";
import { orgInvitationsKey } from "@/app/admin/_data/swr-keys";
import { useUsersByIds } from "@/app/admin/_data/use-users-by-ids";

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
  { value: "canceled", label: "Cancelled" },
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

const statusLabel = (status: Invitation["status"]): string => status === "canceled" ? "cancelled" : status;

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

  const { data: invitations, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : orgInvitationsKey(orgId),
    () => actions.listInvitations(orgId),
  );

  // Inviter names resolve through the shared user cache.
  const { usersById: inviters } = useUsersByIds(
    (invitations ?? []).map((i) => i.inviterId),
    actions.getUser,
  );

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

  const filteredInvs = useMemo(
    () => {
      const all = invitations ?? [];
      return effectiveStatus === "all" ? all : all.filter((i) => i.status === effectiveStatus);
    },
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
      render: (inv) => inviters.get(inv.inviterId)?.name ?? "—",
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
      render: (inv) => <Badge tone={statusBadgeTone(inv.status)} size="sm">{statusLabel(inv.status)}</Badge>,
    },
    {
      key: "actions",
      label: "",
      actions: (inv) => [
        {
          id: "resend",
          label: "Resend",
          variant: "primary",
          isHidden: inv.status !== "pending",
          onAction: () => { setResendError(undefined); setResendTarget(inv); },
        },
        {
          id: "cancel",
          label: "Cancel",
          variant: "danger",
          isHidden: inv.status !== "pending" && inv.status !== "expired",
          onAction: () => { setCancelError(undefined); setCancelTarget(inv); },
        },
      ],
    },
  ];

  async function handleResend() {
    if (!resendTarget) return false;
    setResendError(undefined);
    try {
      await actions.inviteMember(orgId, resendTarget.email, resendTarget.role, true);
      await mutate();
      toast.success("Invitation resent", `A fresh invite was sent to ${resendTarget.email}.`);
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
      await mutate();
      toast.success("Invitation cancelled", `${cancelTarget.email} can no longer use this invite.`);
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
      await mutate();
      toast.success("Invitation sent", `${email} was invited as ${role}.`);
      return true;
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite");
      return false;
    }
  }

  function renderTable() {
    if (showLoading) return <Skeleton rows={4} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
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
      <Inline gap="xs" align="center">
        <Text variant="caption">
          Pending and past invitations to join this organization. Resend or cancel while they are still open.
        </Text>
        <InfoPopover title="Invitation statuses" label="About invitations">
          Pending invitations are awaiting a response and can be resent or cancelled. Expired ones passed their deadline — resend to issue a fresh one. Accepted, rejected, and cancelled invitations are kept for history and need no action.
        </InfoPopover>
      </Inline>
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
