"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Inline,
  Panel,
  RadioGroup,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@id/ui";
import {
  updateUser as updateUserAction,
  setRole as setRoleAction,
  setUserPassword as setUserPasswordAction,
  banUser as banUserAction,
  unbanUser as unbanUserAction,
  removeUser as removeUserAction,
} from "../../_actions/users";
import { useUserDetail } from "./user-detail-context";
import { isUsersListKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  updateUser: updateUserAction,
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

type UserDetailOverviewContentProps = {
  onNavigateToUsers?: () => void;
  actions?: typeof defaultActions;
};

export function UserDetailOverviewContent({
  onNavigateToUsers,
  actions = defaultActions,
}: UserDetailOverviewContentProps) {
  const { userId, user, setUser, isLoading, error } = useUserDetail();
  const { mutate: globalMutate } = useSWRConfig();

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

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [typedEmail, setTypedEmail] = useState("");

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

  async function handleDelete() {
    setDeleteError(undefined);
    try {
      await actions.removeUser(userId);
      await globalMutate(isUsersListKey, undefined, { revalidate: false });
      onNavigateToUsers?.();
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete user");
      return false;
    }
  }

  if (isLoading) return <Skeleton rows={4} height="md" />;
  if (error) return null;
  if (!user) return null;

  return (
    <Stack gap="md">
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

      {/* Edit Profile */}
      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditError(undefined); }}
        title="Edit Profile"
        description="Changing the email can affect sign-in, verification, and downstream account matching."
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <TextInput label="Name" name="name" defaultValue={user.name ?? ""} />
        <TextInput label="Email" name="email" type="email" defaultValue={user.email ?? ""} />
        <TextInput label="Avatar URL" name="image" defaultValue={user.image ?? ""} />
      </ConfirmDialog>

      {/* Set Role */}
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

      {/* Reset Password */}
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

      {/* Ban User */}
      <ConfirmDialog
        open={banOpen}
        onOpenChange={(o) => { setBanOpen(o); if (!o) setBanError(undefined); }}
        title={`Ban ${user.name ?? "User"}`}
        description="Banned users cannot start new sessions. Existing sessions should be reviewed from the Sessions tab."
        confirmLabel="Ban User"
        variant="danger"
        error={banError}
        onConfirm={handleBan}
      >
        <TextInput label="Reason" name="banReason" />
        <TextInput label="Ban duration (seconds)" name="banExpiresIn" />
        <Text variant="caption">Leave duration blank for a permanent ban.</Text>
      </ConfirmDialog>

      {/* Unban User */}
      <ConfirmDialog
        open={unbanOpen}
        onOpenChange={(o) => { setUnbanOpen(o); if (!o) setUnbanError(undefined); }}
        title="Unban User"
        description={`Restore access for ${user.name ?? "this user"}?`}
        confirmLabel="Unban"
        error={unbanError}
        onConfirm={handleUnban}
      />

      {/* Delete User */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => { setDeleteOpen(o); if (!o) { setDeleteError(undefined); setTypedEmail(""); } }}
        title={`Delete ${user.name ?? "User"}`}
        description="This removes the user account and cannot be undone."
        confirmLabel="Delete User"
        variant="danger"
        confirmDisabled={typedEmail !== (user.email ?? "")}
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
