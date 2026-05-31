"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import {
  Alert,
  Badge,
  ConfirmDialog,
  DescriptionList,
  DurationInput,
  ErrorAlert,
  FilterDropdown,
  HiddenInput,
  Inline,
  RadioGroup,
  ResponsiveActions,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  toast,
} from "@id/ui";
import {
  updateUser as updateUserAction,
  impersonateUser as impersonateUserAction,
  stopImpersonating as stopImpersonatingAction,
  setRole as setRoleAction,
  setUserPassword as setUserPasswordAction,
  banUser as banUserAction,
  unbanUser as unbanUserAction,
  removeUser as removeUserAction,
} from "../../_actions/users";
import { AdminDetailTitleRow } from "../admin-detail-title-row";
import { useUserDetail } from "./user-detail-context";
import { isUsersListKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  updateUser: updateUserAction,
  impersonateUser: impersonateUserAction,
  stopImpersonating: stopImpersonatingAction,
  setRole: setRoleAction,
  setUserPassword: setUserPasswordAction,
  banUser: banUserAction,
  unbanUser: unbanUserAction,
  removeUser: removeUserAction,
};

const roleOptions = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

const banDurationOptions = [
  { value: "", label: "Permanent" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "1 day" },
  { value: "604800", label: "1 week" },
  { value: "2592000", label: "1 month" },
  { value: "7776000", label: "3 months" },
  { value: "15552000", label: "6 months" },
  { value: "31536000", label: "1 year" },
  { value: "custom", label: "Custom..." },
];

type UserDetailHeaderContentProps = {
  activeTab?: "overview" | "sessions" | "audit";
  routeBasePath?: string;
  backHref?: string;
  onImpersonateRedirect?: () => void;
  onNavigateToUsers?: () => void;
  actions?: typeof defaultActions;
};

function userDetailTabs(routeBasePath: string) {
  return [
    { id: "overview", href: routeBasePath, label: "Overview" },
    { id: "sessions", href: `${routeBasePath}/sessions`, label: "Sessions" },
    { id: "audit", href: `${routeBasePath}/audit`, label: "Audit" },
  ];
}

export function UserDetailHeaderContent({
  activeTab = "overview",
  routeBasePath,
  backHref = "/admin/platform/identity/users",
  onImpersonateRedirect,
  onNavigateToUsers,
  actions = defaultActions,
}: UserDetailHeaderContentProps) {
  const { userId, user, setUser, currentSession, setCurrentSession, isLoading, error, refetch } = useUserDetail();
  const { mutate: globalMutate } = useSWRConfig();

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | undefined>();
  const [stopError, setStopError] = useState<string | undefined>();
  const [roleOpen, setRoleOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("user");
  const [roleError, setRoleError] = useState<string | undefined>();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [banOpen, setBanOpen] = useState(false);
  const [banError, setBanError] = useState<string | undefined>();
  const [banPreset, setBanPreset] = useState("");
  const [unbanOpen, setUnbanOpen] = useState(false);
  const [unbanError, setUnbanError] = useState<string | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [typedEmail, setTypedEmail] = useState("");

  const isImpersonating = Boolean(currentSession?.user?.impersonatedBy);

  async function handleEdit(formData: FormData) {
    setEditError(undefined);
    try {
      const data: Partial<{ name: string; email: string; image: string }> = {};
      const name = String(formData.get("name") ?? "").trim();
      const email = String(formData.get("email") ?? "").trim();
      const image = String(formData.get("image") ?? "").trim();
      if (name) data.name = name;
      if (email) data.email = email;
      if (image !== (user?.image ?? "")) data.image = image || "";
      const { user: updated } = await actions.updateUser(userId, data);
      setUser(updated);
      toast.success("Profile updated");
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update user");
      return false;
    }
  }

  async function handleImpersonate() {
    setImpersonateError(undefined);
    setStopError(undefined);
    try {
      await actions.impersonateUser(userId);
      onImpersonateRedirect?.();
      return true;
    } catch (err: unknown) {
      setImpersonateError(err instanceof Error ? err.message : "Failed to impersonate user");
      return false;
    }
  }

  async function handleStopImpersonating() {
    setStopError(undefined);
    try {
      await actions.stopImpersonating();
      setCurrentSession(null);
      refetch();
      toast.success("Returned to your admin session");
    } catch (err: unknown) {
      setStopError(err instanceof Error ? err.message : "Failed to stop impersonating");
    }
  }

  async function handleSetRole(formData: FormData) {
    setRoleError(undefined);
    try {
      const role = String(formData.get("role") ?? selectedRole);
      const { user: updated } = await actions.setRole(userId, role);
      setUser(updated);
      toast.success("Role updated", `${updated.name ?? "User"} is now ${role}.`);
      return true;
    } catch (err: unknown) {
      setRoleError(err instanceof Error ? err.message : "Failed to set role");
      return false;
    }
  }

  async function handleSetPassword(formData: FormData) {
    setPasswordError(undefined);
    try {
      const password = String(formData.get("password") ?? "");
      if (!password) { setPasswordError("Password is required"); return false; }
      await actions.setUserPassword(userId, password);
      toast.success("Password set", "Share it through a secure channel. Existing sessions stay active.");
      return true;
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Failed to set password");
      return false;
    }
  }

  async function handleBan(formData: FormData) {
    setBanError(undefined);
    try {
      const banReason = String(formData.get("banReason") ?? "").trim() || undefined;
      const banExpiresInStr = String(formData.get("banExpiresIn") ?? "").trim();
      const banExpiresIn = banExpiresInStr ? Number(banExpiresInStr) : undefined;
      if (banExpiresInStr && (isNaN(Number(banExpiresInStr)) || Number(banExpiresInStr) <= 0)) {
        setBanError("Duration must be a positive number");
        return false;
      }
      const { user: updated } = await actions.banUser(userId, banReason, banExpiresIn);
      setUser(updated);
      toast.success("User banned", "New sessions are blocked. Review active sessions in the Sessions tab.");
      return true;
    } catch (err: unknown) {
      setBanError(err instanceof Error ? err.message : "Failed to ban user");
      return false;
    }
  }

  async function handleUnban() {
    setUnbanError(undefined);
    try {
      const { user: updated } = await actions.unbanUser(userId);
      setUser(updated);
      toast.success("User unbanned", "Access has been restored.");
      return true;
    } catch (err: unknown) {
      setUnbanError(err instanceof Error ? err.message : "Failed to unban user");
      return false;
    }
  }

  async function handleDelete() {
    setDeleteError(undefined);
    try {
      await actions.removeUser(userId);
      await globalMutate(isUsersListKey, undefined, { revalidate: false });
      toast.success("User deleted");
      onNavigateToUsers?.();
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete user");
      return false;
    }
  }

  if (isLoading) {
    return <Skeleton rows={2} height="md" />;
  }

  const headerActions = user
    ? [
        {
          id: "edit",
          label: "Edit Profile",
          onAction: () => setEditOpen(true),
        },
        isImpersonating
          ? {
              id: "stop-impersonating",
              label: "Stop Impersonating",
              onAction: () => { void handleStopImpersonating(); },
            }
          : {
              id: "impersonate",
              label: "Impersonate",
              onAction: () => setImpersonateOpen(true),
            },
        {
          id: "set-role",
          label: "Set Role",
          onAction: () => { setSelectedRole(user.role); setRoleOpen(true); },
        },
        {
          id: "reset-password",
          label: "Reset Password",
          onAction: () => setPasswordOpen(true),
        },
        user.banned
          ? {
              id: "unban",
              label: "Unban User",
              variant: "secondary" as const,
              onAction: () => setUnbanOpen(true),
            }
          : {
              id: "ban",
              label: "Ban User",
              variant: "danger" as const,
              onAction: () => setBanOpen(true),
            },
        {
          id: "delete",
          label: "Delete User",
          variant: "danger" as const,
          onAction: () => { setTypedEmail(""); setDeleteOpen(true); },
        },
      ]
    : [];

  return (
    <>
      <Inline justify="between" wrap={false}>
        <AdminDetailTitleRow
          backHref={backHref}
          backLabel="Users"
          title={user?.name ?? "User unavailable"}
        >
          {user ? <Badge tone={user.role === "admin" ? "primary" : "neutral"}>{user.role}</Badge> : null}
        </AdminDetailTitleRow>
        {!error && (
          <ResponsiveActions ariaLabel="User actions" actions={headerActions} />
        )}
      </Inline>

      {error && !user && <ErrorAlert message={error} onRetry={refetch} />}
      {stopError && <Alert tone="error">{stopError}</Alert>}

      <Tabs
        ariaLabel="User detail tabs"
        selectedKey={activeTab}
        items={userDetailTabs(routeBasePath ?? `/admin/platform/identity/users/${userId}`)}
      />

      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditError(undefined); }}
        title="Edit Profile"
        description="Changing the email can affect sign-in, verification, and downstream account matching."
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <TextInput label="Name" name="name" defaultValue={user?.name ?? ""} />
        <TextInput label="Email" name="email" type="email" defaultValue={user?.email ?? ""} />
        <TextInput label="Avatar URL" name="image" defaultValue={user?.image ?? ""} />
      </ConfirmDialog>

      <ConfirmDialog
        open={impersonateOpen}
        onOpenChange={(o) => { setImpersonateOpen(o); if (!o) setImpersonateError(undefined); }}
        title="Impersonate User"
        description={`You will be signed in as ${user?.name ?? "this user"}. Your admin session remains active. Use 'Stop Impersonating' to return.`}
        confirmLabel="Impersonate"
        error={impersonateError}
        onConfirm={handleImpersonate}
      >
        {user ? (
          <DescriptionList
            columns={1}
            dense
            items={[
              { term: "User ID", description: user.id, mono: true },
              { term: "Email", description: user.email, mono: true },
              { term: "Role", description: user.role },
            ]}
          />
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={roleOpen}
        onOpenChange={(o) => { setRoleOpen(o); if (!o) setRoleError(undefined); }}
        title="Set Role"
        description="Admin role grants access to identity administration. Keep at least one trusted admin active."
        confirmLabel="Save"
        error={roleError}
        onConfirm={handleSetRole}
      >
        <RadioGroup
          title="Role"
          name="role"
          options={roleOptions}
          value={selectedRole}
          onChange={setSelectedRole}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={passwordOpen}
        onOpenChange={(o) => { setPasswordOpen(o); if (!o) setPasswordError(undefined); }}
        title="Reset Password"
        description="Set a temporary password and share it through a secure channel. Existing sessions are not revoked by this action."
        confirmLabel="Set Password"
        error={passwordError}
        onConfirm={handleSetPassword}
      >
        <TextInput
          label="New Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          validate={(value) => value.length >= 12 || "Use at least 12 characters"}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={banOpen}
        onOpenChange={(o) => { setBanOpen(o); if (!o) { setBanError(undefined); setBanPreset(""); } }}
        title={`Ban ${user?.name ?? "User"}`}
        description="Banned users cannot start new sessions. Existing sessions should be reviewed from the Sessions tab."
        confirmLabel="Ban User"
        variant="danger"
        error={banError}
        onConfirm={handleBan}
      >
        <TextInput label="Reason" name="banReason" />
        <FilterDropdown
          label="Ban duration"
          options={banDurationOptions}
          value={banPreset}
          onChange={setBanPreset}
          showLabel
        />
        {banPreset === "custom" ? (
          <DurationInput label="Custom duration" name="banExpiresIn" required />
        ) : (
          <HiddenInput name="banExpiresIn" value={banPreset} />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={unbanOpen}
        onOpenChange={(o) => { setUnbanOpen(o); if (!o) setUnbanError(undefined); }}
        title="Unban User"
        description={`Restore access for ${user?.name ?? "this user"}?`}
        confirmLabel="Unban"
        error={unbanError}
        onConfirm={handleUnban}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => { setDeleteOpen(o); if (!o) { setDeleteError(undefined); setTypedEmail(""); } }}
        title={`Delete ${user?.name ?? "User"}`}
        description="This removes the user account and cannot be undone."
        confirmLabel="Delete User"
        variant="danger"
        confirmDisabled={typedEmail !== (user?.email ?? "")}
        error={deleteError}
        onConfirm={handleDelete}
      >
        <Stack gap="sm">
          <DescriptionList
            columns={1}
            dense
            items={[
              { term: "User ID", description: user?.id ?? userId, mono: true },
              { term: "Email", description: user?.email ?? "Unknown", mono: true },
              { term: "Role", description: user?.role ?? "Unknown" },
            ]}
          />
          <Text variant="body">This is irreversible. ALL user data, sessions, and accounts will be removed.</Text>
        </Stack>
        <TextInput
          label="Type the user's email to confirm"
          name="confirmEmail"
          type="email"
          defaultValue=""
          onChange={setTypedEmail}
        />
      </ConfirmDialog>
    </>
  );
}
