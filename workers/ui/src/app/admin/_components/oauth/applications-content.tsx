"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Badge,
  Button,
  CodeBlock,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  Inline,
  LinkButton,
  PageIntro,
  Panel,
  SearchInput,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  Text,
  toast,
} from "@id/ui";
import {
  listClients as listClientsAction,
  rotateClientSecret as rotateClientSecretAction,
  deleteClient as deleteClientAction,
  clientType,
  type ClientType,
  type OAuthClient,
} from "../../_actions/oauth";
import { oauthClientsKey } from "@/app/admin/_data/swr-keys";
import { copyToClipboard } from "@/shared/clipboard";

const defaultActions = {
  listClients: listClientsAction,
  rotateClientSecret: rotateClientSecretAction,
  deleteClient: deleteClientAction,
};

const defaultCreateHref = "/admin/oauth/applications/new";

const typeBadgeTone: Record<ClientType, "neutral" | "info" | "accent"> = {
  confidential: "neutral",
  public: "info",
  M2M: "accent",
};

const typeLabel: Record<ClientType, string> = {
  confidential: "Confidential",
  public: "Public",
  M2M: "M2M",
};

function scopeList(scope: string | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

type ApplicationsContentProps = {
  search?: string;
  onSearchChange?: (v: string) => void;
  onClientClick?: (clientId: string) => void;
  createHref?: string;
  loading?: boolean;
  error?: string;
  actions?: typeof defaultActions;
};

export function ApplicationsContent({
  search: searchProp,
  onSearchChange,
  onClientClick,
  createHref = defaultCreateHref,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: ApplicationsContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const effectiveSearch = searchProp ?? internalSearch;
  const handleSearchChange = onSearchChange ?? setInternalSearch;

  const [rotateTarget, setRotateTarget] = useState<OAuthClient | null>(null);
  const [rotateError, setRotateError] = useState<string | undefined>();

  const [deleteTarget, setDeleteTarget] = useState<OAuthClient | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const [revealSecret, setRevealSecret] = useState<string | undefined>();

  const { data: allClients, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : oauthClientsKey(),
    () => actions.listClients(),
  );

  const displayed = useMemo(() => {
    const clients = allClients ?? [];
    if (!effectiveSearch) return clients;
    const q = effectiveSearch.toLowerCase();
    return clients.filter(
      (c) => c.client_name.toLowerCase().includes(q) || c.client_id.toLowerCase().includes(q),
    );
  }, [allClients, effectiveSearch]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const stats = useMemo(() => {
    const clients = allClients ?? [];
    return clients.reduce(
      (acc, client) => {
        acc.total += 1;
        acc[clientType(client)] += 1;
        return acc;
      },
      { total: 0, confidential: 0, public: 0, M2M: 0 } as Record<ClientType | "total", number>,
    );
  }, [allClients]);

  async function handleRotate() {
    if (!rotateTarget) return false;
    setRotateError(undefined);
    try {
      const { client_secret } = await actions.rotateClientSecret(rotateTarget.client_id);
      setRotateTarget(null);
      setRevealSecret(client_secret);
      toast.success("Secret rotated", "The previous secret is now invalid. Update your app config.");
      return true;
    } catch (err: unknown) {
      setRotateError(err instanceof Error ? err.message : "Failed to rotate secret");
      return false;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return false;
    setDeleteError(undefined);
    try {
      const removedName = deleteTarget.client_name;
      await actions.deleteClient(deleteTarget.client_id);
      await mutate((cur) => (cur ?? []).filter((c) => c.client_id !== deleteTarget.client_id), { revalidate: false });
      setDeleteTarget(null);
      toast.success("Application deleted", `${removedName} and its tokens were revoked.`);
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete application");
      return false;
    }
  }

  const columns: DataTableColumn<OAuthClient>[] = [
    {
      key: "client_name",
      label: "Application",
      render: (client) => (
        <Stack gap="xs">
          <Inline gap="sm">
            <Text variant="body">{client.client_name}</Text>
            {client.disabled ? <Badge tone="error" size="sm">Disabled</Badge> : null}
          </Inline>
          <Text variant="caption" mono>{client.client_id}</Text>
        </Stack>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (client) => {
        const type = clientType(client);
        return <Badge tone={typeBadgeTone[type]} size="sm">{typeLabel[type]}</Badge>;
      },
    },
    {
      key: "redirect_uris",
      label: "Redirects",
      render: (client) => client.redirect_uris.length > 0 ? client.redirect_uris.length : "—",
    },
    {
      key: "scope",
      label: "Scopes",
      render: (client) => {
        const scopes = scopeList(client.scope);
        if (scopes.length === 0) return "—";
        return (
          <Inline gap="xs" wrap>
            {scopes.map((scope) => <Badge key={scope} tone="primary" size="sm">{scope}</Badge>)}
          </Inline>
        );
      },
    },
    {
      key: "grant_types",
      label: "Grants",
      render: (client) => (
        <Inline gap="xs" wrap>
          {client.grant_types.map((grant) => <Badge key={grant} tone="neutral" size="sm">{grant}</Badge>)}
        </Inline>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      actions: (client) => {
        const type = clientType(client);
        return [
          {
            id: "rotate",
            label: "Rotate Secret",
            iconName: "RefreshCw",
            ariaLabel: `Rotate secret for ${client.client_name}`,
            tooltip: "Rotate client secret",
            isHidden: type === "public",
            onAction: () => { setRotateError(undefined); setRotateTarget(client); },
          },
          {
            id: "delete",
            label: "Delete",
            variant: "danger",
            iconName: "Trash2",
            ariaLabel: `Delete ${client.client_name}`,
            tooltip: "Delete application",
            onAction: () => { setDeleteError(undefined); setDeleteTarget(client); },
          },
        ];
      },
    },
  ];

  function renderList() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (displayed.length === 0) {
      if (effectiveSearch) {
        return <EmptyState message="No applications match your search" cta="Clear search" onCta={() => handleSearchChange("")} />;
      }
      return <EmptyState message="No OAuth applications" cta="Create Application" ctaHref={createHref} />;
    }
    return (
      <DataTable<OAuthClient>
        columns={columns}
        rows={displayed}
        getRowKey={(client) => client.client_id}
        onRowClick={onClientClick ? (client) => onClientClick(client.client_id) : undefined}
      />
    );
  }

  const hasRows = displayed.length > 0 && !showLoading && !showError;

  return (
    <Stack gap="md">
      <PageIntro
        title="OAuth Applications"
        description="Clients that can request tokens from this identity provider — web apps, SPAs, native apps, and machine-to-machine services."
        info="Each application is an OAuth 2.0 client with its own ID and (except public SPAs) a secret. Confidential clients use the authorization code flow with a secret; public clients use code + PKCE with no secret; M2M clients use client credentials. Configure redirect URIs, scopes, and metadata per app, and rotate the secret if it leaks."
        actions={
          <LinkButton href={createHref} iconName="Plus">New App</LinkButton>
        }
      />
      <StatGroup columns={4}>
        <Stat title="Total" value={stats.total} description="applications" tone="primary" />
        <Stat title="Confidential" value={stats.confidential} description="server apps" />
        <Stat title="Public" value={stats.public} description="PKCE clients" tone="info" />
        <Stat title="M2M" value={stats.M2M} description="service clients" tone="warning" />
      </StatGroup>
      <Panel>
        <SearchInput grow placeholder="Search applications…" value={effectiveSearch} onChange={handleSearchChange} />
      </Panel>

      <Panel padding={hasRows ? "none" : "md"}>{renderList()}</Panel>

      <ConfirmDialog
        open={Boolean(rotateTarget)}
        onOpenChange={(o) => { if (!o) { setRotateTarget(null); setRotateError(undefined); } }}
        title="Rotate Client Secret"
        description={`This invalidates the current secret for ${rotateTarget?.client_name ?? "this client"} immediately. Make sure to update your application config.`}
        confirmLabel="Rotate"
        variant="danger"
        error={rotateError}
        onConfirm={handleRotate}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(undefined); } }}
        title="Delete Application"
        description={`Delete ${deleteTarget?.client_name ?? "this application"}? This invalidates all tokens issued for this client and breaks every integration using it.`}
        confirmLabel="Delete Application"
        variant="danger"
        error={deleteError}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={Boolean(revealSecret)}
        onOpenChange={(o) => { if (!o) setRevealSecret(undefined); }}
        title="Client Secret"
        description="Copy this secret now — it is shown only once and cannot be retrieved later."
        confirmLabel="Done"
        cancelLabel="Close"
        onConfirm={() => true}
      >
        <CodeBlock
          label="Secret"
          value={revealSecret ?? ""}
          maxHeight="sm"
          action={
            <Button size="sm" variant="secondary" iconName="Copy" tooltip="Copy to clipboard" onClick={() => {
              if (!revealSecret) return;
              void (async () => {
                const ok = await copyToClipboard(revealSecret);
                if (ok) toast.success("Secret copied", "Store it securely — it won't be shown again.");
                else toast.error("Couldn't copy", "Copy the secret manually before closing.");
              })();
            }}>
              Copy
            </Button>
          }
        />
      </ConfirmDialog>
    </Stack>
  );
}
