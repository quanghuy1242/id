"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ActiveScope } from "@id/lib";
import {
  Badge,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  FilterDropdown,
  Inline,
  PageIntro,
  Panel,
  SearchInput,
  Skeleton,
  Stack,
  toast,
} from "@id/ui";
import {
  listAdminConsents as listAdminConsentsAction,
  revokeConsent as revokeConsentAction,
  type AdminConsent,
} from "../../_actions/audit";
import { listClients as listClientsAction } from "../../_actions/oauth";
import { adminConsentsKey, oauthClientsKey } from "@/app/admin/_data/swr-keys";
import { ADMIN_AUDIT_PAGE_SIZE } from "@/shared/constants";

const platformScope: ActiveScope = { kind: "platform" };

const defaultActions = {
  listAdminConsents: listAdminConsentsAction,
  revokeConsent: revokeConsentAction,
  listClients: listClientsAction,
};

type ConsentsContentProps = {
  scope?: ActiveScope;
  loading?: boolean;
  error?: string;
  actions?: typeof defaultActions;
};

function formatDate(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toLocaleDateString();
}

export function ConsentsContent({ scope, loading, error, actions = defaultActions }: ConsentsContentProps) {
  const [offset, setOffset] = useState(0);
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<AdminConsent | null>(null);
  const [revokeError, setRevokeError] = useState<string | undefined>();
  const effectiveScope = scope ?? platformScope;
  const organizationId =
    effectiveScope.kind === "organization"
      ? effectiveScope.organizationId
      : undefined;

  const params = useMemo(
    () => ({
      limit: ADMIN_AUDIT_PAGE_SIZE,
      offset,
      ...(clientFilter !== "all" ? { clientId: clientFilter } : {}),
      ...(organizationId ? { organizationId } : {}),
    }),
    [offset, clientFilter, organizationId],
  );
  const { data, isLoading, error: swrError, mutate } = useSWR(
    loading || error ? null : adminConsentsKey(params),
    () => actions.listAdminConsents(params),
  );
  const { data: clients } = useSWR(
    loading || error ? null : oauthClientsKey(effectiveScope),
    () => actions.listClients(effectiveScope),
  );

  const clientOptions = useMemo(
    () => [{ value: "all", label: "All clients" }, ...(clients ?? []).map((c) => ({ value: c.client_id, label: c.client_name }))],
    [clients],
  );

  const showLoading = loading ?? isLoading;
  const showError = error ?? (swrError instanceof Error ? swrError.message : swrError ? String(swrError) : undefined);

  const rows = useMemo(() => {
    const all = data?.consents ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((c) => (c.userEmail ?? "").toLowerCase().includes(q));
  }, [data, search]);

  async function handleRevoke() {
    if (!revokeTarget) return false;
    if (!revokeTarget.userId) {
      setRevokeError("This consent record has no user id");
      return false;
    }
    setRevokeError(undefined);
    try {
      const who = revokeTarget.userEmail ?? "the user";
      const what = revokeTarget.clientName ?? "the client";
      if (organizationId) {
        await actions.revokeConsent(
          revokeTarget.clientId,
          revokeTarget.userId,
          organizationId,
        );
      } else {
        await actions.revokeConsent(revokeTarget.clientId, revokeTarget.userId);
      }
      await mutate();
      setRevokeTarget(null);
      toast.success("Consent revoked", `${who} will be asked to re-approve ${what}.`);
      return true;
    } catch (err: unknown) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke consent");
      return false;
    }
  }

  const columns: DataTableColumn<AdminConsent>[] = [
    { key: "userEmail", label: "User Email", render: (c) => c.userEmail ?? c.userId ?? "—" },
    { key: "clientName", label: "Client", render: (c) => c.clientName ?? c.clientId },
    { key: "scopes", label: "Scopes", render: (c) => <Inline gap="xs" wrap>{c.scopes.map((s) => <Badge key={s} tone="primary" size="sm">{s}</Badge>)}</Inline> },
    { key: "createdAt", label: "Granted", render: (c) => formatDate(c.createdAt) },
    {
      key: "actions",
      label: "Actions",
      actions: (c) => [
        {
          id: "revoke",
          label: "Revoke",
          variant: "danger",
          onAction: () => { setRevokeError(undefined); setRevokeTarget(c); },
        },
      ],
    },
  ];

  function renderContent() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if ((data?.total ?? 0) === 0) {
      if (clientFilter !== "all") return <EmptyState message="No consents for selected client" cta="Clear filter" onCta={() => { setClientFilter("all"); setOffset(0); }} />;
      return <EmptyState message="No OAuth consent records" />;
    }
    return (
      <DataTable<AdminConsent>
        columns={columns}
        rows={rows}
        getRowKey={(c) => c.id}
        pagination={{ total: data?.total ?? 0, limit: ADMIN_AUDIT_PAGE_SIZE, offset, onChange: setOffset }}
      />
    );
  }

  const hasRows = (data?.total ?? 0) > 0 && !showLoading && !showError;

  return (
    <Stack gap="md">
      <PageIntro
        title="Consents"
        description="A record of which applications each user has authorized, and the scopes they approved."
        info="When a user approves an OAuth application's request, a consent is stored so they aren't prompted again. Revoking a consent forces that user to re-approve the application on their next authorization request — useful if scopes changed or access should be withdrawn. It does not immediately revoke already-issued tokens; manage those under Sessions & Tokens."
      />
      <Panel>
        <Inline gap="sm" justify="between" wrap>
          <SearchInput grow placeholder="Search by email…" value={search} onChange={setSearch} />
          <FilterDropdown label="Client" options={clientOptions} value={clientFilter} onChange={(v) => { setClientFilter(v); setOffset(0); }} />
        </Inline>
      </Panel>
      <Panel padding={hasRows ? "none" : "md"}>{renderContent()}</Panel>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(o) => { if (!o) { setRevokeTarget(null); setRevokeError(undefined); } }}
        title="Revoke Consent"
        description={`Revoke consent for ${revokeTarget?.userEmail ?? "this user"} on ${revokeTarget?.clientName ?? "this client"}? They will need to re-consent on the next authorization request.`}
        confirmLabel="Revoke"
        variant="danger"
        error={revokeError}
        onConfirm={handleRevoke}
      />
    </Stack>
  );
}
