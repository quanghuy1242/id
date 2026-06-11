"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Badge,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorAlert,
  Inline,
  PageIntro,
  Panel,
  Skeleton,
  Stack,
  Text,
  toast,
  type DataTableColumn,
} from "@idco/ui";
import { accountConsentsKey } from "../_data/swr-keys";
import { defaultAccountActions, type AccountActions, type AccountConsent } from "../_actions/account";
import { shortDateLabel } from "./account-format";

type AccountConsentsContentProps = {
  readonly actions?: Pick<AccountActions, "listAccountConsents" | "revokeAccountConsent">;
  readonly loading?: boolean;
  readonly error?: string;
};

export function AccountConsentsContent({
  actions = defaultAccountActions,
  loading,
  error: errorOverride,
}: AccountConsentsContentProps) {
  const skipFetch = loading || errorOverride;
  const { data, isLoading, error, mutate } = useSWR(skipFetch ? null : accountConsentsKey(), () => actions.listAccountConsents());
  const [pendingConsent, setPendingConsent] = useState<AccountConsent | null>(null);
  const [dialogError, setDialogError] = useState<string | undefined>();
  const showLoading = loading ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const consents = data?.consents ?? [];

  async function revokeConsent(): Promise<boolean> {
    if (!pendingConsent) return true;
    setDialogError(undefined);
    try {
      await actions.revokeAccountConsent(pendingConsent.clientId);
      await mutate();
      toast.success("Application disconnected", "Future authorization will require consent again.");
      return true;
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : "Failed to disconnect application");
      return false;
    }
  }

  const columns: readonly DataTableColumn<AccountConsent>[] = [
    {
      key: "client",
      label: "Application",
      render: (consent) => (
        <Stack gap="xs">
          <Text>{consent.clientName ?? consent.clientId}</Text>
          <Text variant="caption" mono>{consent.clientId}</Text>
        </Stack>
      ),
    },
    {
      key: "scopes",
      label: "Scopes",
      render: (consent) => (
        <Inline>
          {consent.scopes.map((scope) => <Badge key={scope} tone="neutral" size="sm">{scope}</Badge>)}
        </Inline>
      ),
    },
    { key: "updatedAt", label: "Last authorized", render: (consent) => shortDateLabel(consent.updatedAt ?? consent.createdAt) },
    {
      key: "actions",
      label: "",
      actions: (consent) => [{ id: "revoke", label: "Disconnect", variant: "danger", onAction: () => setPendingConsent(consent) }],
    },
  ];

  if (showLoading) {
    return (
      <Stack>
        <PageIntro title="Connected apps" description="Review applications you have authorized with OAuth or OpenID Connect." />
        <Panel><Skeleton rows={8} /></Panel>
      </Stack>
    );
  }

  if (showError) {
    return (
      <Stack>
        <PageIntro title="Connected apps" description="Review applications you have authorized with OAuth or OpenID Connect." />
        <ErrorAlert message={showError} onRetry={() => void mutate()} />
      </Stack>
    );
  }

  return (
    <>
      <Stack>
        <PageIntro
          title="Connected apps"
          description="Review applications you have authorized with OAuth or OpenID Connect."
          info="Disconnecting an application removes your stored consent grant. Existing access tokens may remain valid until they expire; the next authorization request will prompt again when consent is required."
        />
        <Panel padding={consents.length > 0 ? "none" : "md"}>
          {consents.length === 0 ? (
            <EmptyState message="No connected applications" />
          ) : (
            <DataTable columns={columns} rows={consents} getRowKey={(consent) => consent.id} />
          )}
        </Panel>
      </Stack>
      <ConfirmDialog
        open={pendingConsent !== null}
        onOpenChange={(open) => { if (!open) { setPendingConsent(null); setDialogError(undefined); } }}
        title="Disconnect Application"
        description={`Disconnect ${pendingConsent?.clientName ?? pendingConsent?.clientId ?? "this application"} from your account.`}
        confirmLabel="Disconnect"
        variant="danger"
        error={dialogError}
        onConfirm={revokeConsent}
      />
    </>
  );
}

