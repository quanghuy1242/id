"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  ErrorAlert,
  Inline,
  LinkButton,
  Skeleton,
  Tabs,
  Text,
} from "@id/ui";
import {
  impersonateUser as impersonateUserAction,
  stopImpersonating as stopImpersonatingAction,
} from "../../_actions/users";
import { useUserDetail } from "./user-detail-context";

const defaultActions = {
  impersonateUser: impersonateUserAction,
  stopImpersonating: stopImpersonatingAction,
};

type UserDetailHeaderContentProps = {
  activeTab?: "overview" | "sessions";
  onImpersonateRedirect?: () => void;
  actions?: typeof defaultActions;
};

function userDetailTabs(userId: string) {
  return [
    { id: "overview", href: `/admin/identity/users/${userId}`, label: "Overview" },
    { id: "sessions", href: `/admin/identity/users/${userId}/sessions`, label: "Sessions" },
  ];
}

export function UserDetailHeaderContent({
  activeTab = "overview",
  onImpersonateRedirect,
  actions = defaultActions,
}: UserDetailHeaderContentProps) {
  const { userId, user, currentSession, setCurrentSession, isLoading, error, refetch } = useUserDetail();

  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | undefined>();
  const [stopError, setStopError] = useState<string | undefined>();

  const isImpersonating = Boolean(currentSession?.user?.impersonatedBy);

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
    } catch (err: unknown) {
      setStopError(err instanceof Error ? err.message : "Failed to stop impersonating");
    }
  }

  if (isLoading) {
    return <Skeleton rows={2} height="md" />;
  }

  return (
    <>
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
          {error && !user && <Text variant="h1">User unavailable</Text>}
        </Inline>
        {!error && (
          isImpersonating ? (
            <Button variant="secondary" onClick={handleStopImpersonating}>
              Stop Impersonating
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setImpersonateOpen(true)}>
              Impersonate
            </Button>
          )
        )}
      </Inline>

      {error && !user && <ErrorAlert message={error} onRetry={refetch} />}
      {stopError && <Alert tone="error">{stopError}</Alert>}

      <Tabs
        ariaLabel="User detail tabs"
        selectedKey={activeTab}
        items={userDetailTabs(userId)}
      />

      <ConfirmDialog
        open={impersonateOpen}
        onOpenChange={(o) => { setImpersonateOpen(o); if (!o) setImpersonateError(undefined); }}
        title="Impersonate User"
        description={`You will be signed in as ${user?.name ?? "this user"}. Your admin session remains active. Use 'Stop Impersonating' to return.`}
        confirmLabel="Impersonate"
        error={impersonateError}
        onConfirm={handleImpersonate}
      />
    </>
  );
}
