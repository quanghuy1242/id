"use client";

import { useState, useEffect } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  ErrorAlert,
  Inline,
  LinkButton,
  Panel,
  RadioGroup,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@id/ui";
import {
  getUser as getUserAction,
  updateUser as updateUserAction,
  setRole as setRoleAction,
  setUserPassword as setUserPasswordAction,
  banUser as banUserAction,
  unbanUser as unbanUserAction,
  impersonateUser as impersonateUserAction,
  stopImpersonating as stopImpersonatingAction,
  removeUser as removeUserAction,
  getCurrentSession as getCurrentSessionAction,
  type User,
  type CurrentSession,
} from "../../_actions/users";

const defaultActions = {
  getUser: getUserAction,
  updateUser: updateUserAction,
  setRole: setRoleAction,
  setUserPassword: setUserPasswordAction,
  banUser: banUserAction,
  unbanUser: unbanUserAction,
  impersonateUser: impersonateUserAction,
  stopImpersonating: stopImpersonatingAction,
  removeUser: removeUserAction,
  getCurrentSession: getCurrentSessionAction,
};

const roleOptions = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

function userDetailTabs(uid: string) {
  return [
    { id: "overview", href: `/admin/identity/users/${uid}`, label: "Overview" },
    { id: "sessions", href: `/admin/identity/users/${uid}/sessions`, label: "Sessions" },
  ];
}

type UserDetailContentProps = {
  userId: string;
  loading?: boolean;
  error?: string;
  onNavigateToSessions?: () => void;
  onNavigateToUsers?: () => void;
  onImpersonateRedirect?: () => void;
  actions?: typeof defaultActions;
};

export function UserDetailContent({
  userId,
  loading: loadingOverride,
  error: errorOverride,
  onNavigateToSessions,
  onNavigateToUsers,
  onImpersonateRedirect,
  actions = defaultActions,
}: UserDetailContentProps) {
  const [user, setUser] = useState<User | null>(null);
  const [currentSession, setCurrentSession] = useState<CurrentSession>(null);
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();

  const [roleOpen, setRoleOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("user");
  const [roleError, setRoleError] = useState<string | undefined>();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();

  const [banOpen, setBanOpen] = useState(false);
  const [banError, setBanError] = useState<string | undefined>();

  const [unbanOpen, setUnbanOpen] = useState(false);
  const [unbanError, setUnbanError] = useState<string | undefined>();

  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | undefined>();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [typedEmail, setTypedEmail] = useState("");

  useEffect(() => {
    if (loadingOverride || errorOverride) return;
    setIsLoading(true);
    setFetchError(undefined);
    let cancelled = false;
    void (async () => {
      try {
        const [{ user: fetchedUser }, session] = await Promise.all([
          actions.getUser(userId),
          actions.getCurrentSession(),
        ]);
        if (!cancelled) {
          setUser(fetchedUser);
          setCurrentSession(session);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load user");
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [actions, userId, loadingOverride, errorOverride, fetchKey]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;
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
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update user");
      return false;
    }
  }

  async function handleSetRole(formData: FormData) {
    setRoleError(undefined);
    try {
      const role = String(formData.get("role") ?? selectedRole);
      const { user: updated } = await actions.setRole(userId, role);
      setUser(updated);
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
      return true;
    } catch (err: unknown) {
      setUnbanError(err instanceof Error ? err.message : "Failed to unban user");
      return false;
    }
  }

  async function handleImpersonate() {
    setImpersonateError(undefined);
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
    try {
      await actions.stopImpersonating();
      setFetchKey((k) => k + 1);
    } catch {
      // ignore — refresh anyway
      setFetchKey((k) => k + 1);
    }
  }

  async function handleDelete() {
    setDeleteError(undefined);
    try {
      await actions.removeUser(userId);
      onNavigateToUsers?.();
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete user");
      return false;
    }
  }

  const pageHeader = (
    <Inline justify="between">
      <Inline gap="sm">
        <LinkButton href="/admin/identity/users" variant="secondary">
          ← Users
        </LinkButton>
        {user && (
          <>
            <Text variant="h1">{user.name}</Text>
            <Badge tone={user.role === "admin" ? "primary" : "neutral"}>{user.role}</Badge>
          </>
        )}
        {showLoading && !user && <Text variant="h1">Loading…</Text>}
      </Inline>
      {isImpersonating ? (
        <Button variant="secondary" onClick={handleStopImpersonating}>
          Stop Impersonating
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => setImpersonateOpen(true)}>
          Impersonate
        </Button>
      )}
    </Inline>
  );

  return (
    <Stack gap="md">
      {pageHeader}

      <Tabs
        ariaLabel="User detail tabs"
        selectedKey="overview"
        items={userDetailTabs(userId)}
        onSelectionChange={(key) => {
          if (key === "sessions") onNavigateToSessions?.();
        }}
      />

      {showLoading && <Skeleton rows={4} height="md" />}

      {!showLoading && showError && (
        <ErrorAlert message={showError} onRetry={() => setFetchKey((k) => k + 1)} />
      )}

      {!showLoading && !showError && user && (
        <>
          {user.banned && (
            <Alert tone="warning">
              This user is banned.
              {user.banReason ? ` Reason: ${user.banReason}.` : ""}
              {user.banExpires ? ` Expires: ${new Date(user.banExpires).toLocaleDateString()}.` : " (permanent)"}
            </Alert>
          )}

          <Panel>
            <Stack gap="md">
              <Inline gap="md">
                <Avatar
                  initials={user.name?.slice(0, 2).toUpperCase()}
                  image={user.image ?? undefined}
                  alt={user.name}
                  size="lg"
                />
                <Stack gap="xs">
                  <Inline gap="sm">
                    <Text variant="caption">Name</Text>
                    <Text variant="body">{user.name}</Text>
                  </Inline>
                  <Inline gap="sm">
                    <Text variant="caption">Email</Text>
                    <Text variant="body">{user.email}</Text>
                  </Inline>
                  <Inline gap="sm">
                    <Text variant="caption">Role</Text>
                    <Badge tone={user.role === "admin" ? "primary" : "neutral"}>{user.role}</Badge>
                  </Inline>
                  <Inline gap="sm">
                    <Text variant="caption">Email Verified</Text>
                    {user.emailVerified
                      ? <Badge tone="success">Verified</Badge>
                      : <Badge tone="warning">Unverified</Badge>}
                  </Inline>
                  <Inline gap="sm">
                    <Text variant="caption">Banned</Text>
                    {user.banned
                      ? <Badge tone="error">Banned</Badge>
                      : <Badge tone="success">Active</Badge>}
                  </Inline>
                  <Inline gap="sm">
                    <Text variant="caption">Created</Text>
                    <Text variant="body">{new Date(user.createdAt).toLocaleDateString()}</Text>
                  </Inline>
                </Stack>
              </Inline>
            </Stack>
          </Panel>

          <Panel>
            <Inline wrap gap="md">
              <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit Profile</Button>
              <Button variant="secondary" onClick={() => { setSelectedRole(user.role); setRoleOpen(true); }}>Set Role</Button>
              <Button variant="secondary" onClick={() => setPasswordOpen(true)}>Reset Password</Button>
              {user.banned
                ? <Button variant="secondary" onClick={() => setUnbanOpen(true)}>Unban User</Button>
                : <Button variant="danger" onClick={() => setBanOpen(true)}>Ban User</Button>}
              <Button variant="danger" onClick={() => { setTypedEmail(""); setDeleteOpen(true); }}>Delete User</Button>
            </Inline>
          </Panel>
        </>
      )}

      {/* Edit Profile */}
      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditError(undefined); }}
        title="Edit Profile"
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <TextInput label="Name" name="name" defaultValue={user?.name ?? ""} />
        <TextInput label="Email" name="email" type="email" defaultValue={user?.email ?? ""} />
        <TextInput label="Avatar URL" name="image" defaultValue={user?.image ?? ""} />
      </ConfirmDialog>

      {/* Set Role */}
      <ConfirmDialog
        open={roleOpen}
        onOpenChange={(o) => { setRoleOpen(o); if (!o) setRoleError(undefined); }}
        title="Set Role"
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

      {/* Reset Password */}
      <ConfirmDialog
        open={passwordOpen}
        onOpenChange={(o) => { setPasswordOpen(o); if (!o) setPasswordError(undefined); }}
        title="Reset Password"
        confirmLabel="Set Password"
        error={passwordError}
        onConfirm={handleSetPassword}
      >
        <TextInput label="New Password" name="password" type="password" required />
      </ConfirmDialog>

      {/* Ban User */}
      <ConfirmDialog
        open={banOpen}
        onOpenChange={(o) => { setBanOpen(o); if (!o) setBanError(undefined); }}
        title={`Ban ${user?.name ?? "User"}`}
        confirmLabel="Ban User"
        variant="danger"
        error={banError}
        onConfirm={handleBan}
      >
        <TextInput label="Reason" name="banReason" />
        <TextInput label="Ban duration (seconds)" name="banExpiresIn" />
      </ConfirmDialog>

      {/* Unban User */}
      <ConfirmDialog
        open={unbanOpen}
        onOpenChange={(o) => { setUnbanOpen(o); if (!o) setUnbanError(undefined); }}
        title="Unban User"
        description={`Restore access for ${user?.name ?? "this user"}?`}
        confirmLabel="Unban"
        error={unbanError}
        onConfirm={handleUnban}
      />

      {/* Impersonate */}
      <ConfirmDialog
        open={impersonateOpen}
        onOpenChange={(o) => { setImpersonateOpen(o); if (!o) setImpersonateError(undefined); }}
        title="Impersonate User"
        description={`You will be signed in as ${user?.name ?? "this user"}. Your admin session remains active. Use 'Stop Impersonating' to return.`}
        confirmLabel="Impersonate"
        error={impersonateError}
        onConfirm={handleImpersonate}
      />

      {/* Delete User */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => { setDeleteOpen(o); if (!o) { setDeleteError(undefined); setTypedEmail(""); } }}
        title={`Delete ${user?.name ?? "User"}`}
        confirmLabel="Delete User"
        variant="danger"
        confirmDisabled={typedEmail !== (user?.email ?? "")}
        error={deleteError}
        onConfirm={handleDelete}
      >
        <Text variant="body">This is irreversible. ALL user data, sessions, and accounts will be removed.</Text>
        <TextInput
          label="Type the user's email to confirm"
          name="confirmEmail"
          type="email"
          defaultValue=""
          onChange={setTypedEmail}
        />
      </ConfirmDialog>
    </Stack>
  );
}
