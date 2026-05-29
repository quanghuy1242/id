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
  Panel,
  RadioGroup,
  SearchInput,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@id/ui";
import {
  listClients as listClientsAction,
  createClient as createClientAction,
  updateClient as updateClientAction,
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
  createClient: createClientAction,
  updateClient: updateClientAction,
  rotateClientSecret: rotateClientSecretAction,
  deleteClient: deleteClientAction,
};

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

function splitDelimited(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function scopeString(raw: FormDataEntryValue | null): string | undefined {
  const scopes = String(raw ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes.join(" ") : undefined;
}

function scopeList(scope: string | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

function optionalString(raw: FormDataEntryValue | null): string | undefined {
  return String(raw ?? "").trim() || undefined;
}

function typeDescription(type: string): string {
  if (type === "M2M") return "Client credentials for service-to-service access.";
  if (type === "public") return "Authorization code without a client secret.";
  return "Authorization code with a client secret.";
}

function RedirectUriFields({
  redirectUris,
  postLogoutRedirectUris,
  withPlaceholders,
}: {
  readonly redirectUris?: readonly string[];
  readonly postLogoutRedirectUris?: readonly string[];
  readonly withPlaceholders?: boolean;
}) {
  return (
    <>
      <Textarea
        label="Redirect URIs"
        name="redirect_uris"
        rows={3}
        defaultValue={redirectUris?.join("\n")}
        required
        placeholder={withPlaceholders ? "https://app.example.com/callback" : undefined}
      />
      <Textarea
        label="Post-Logout Redirect URIs"
        name="post_logout_redirect_uris"
        rows={2}
        defaultValue={postLogoutRedirectUris?.join("\n")}
        placeholder={withPlaceholders ? "https://app.example.com/signed-out" : undefined}
      />
    </>
  );
}

function ClientMetadataFields({ client }: { readonly client?: OAuthClient }) {
  return (
    <Stack gap="sm">
      <TextInput label="Client URI" name="client_uri" defaultValue={client?.client_uri ?? ""} />
      <TextInput label="Logo URI" name="logo_uri" defaultValue={client?.logo_uri ?? ""} />
      <TextInput label="Terms URI" name="tos_uri" defaultValue={client?.tos_uri ?? ""} />
      <TextInput label="Policy URI" name="policy_uri" defaultValue={client?.policy_uri ?? ""} />
      <Textarea
        label="Contacts"
        name="contacts"
        rows={2}
        defaultValue={client?.contacts?.join("\n")}
        placeholder={client ? undefined : "admin@example.com"}
      />
    </Stack>
  );
}

type ApplicationsContentProps = {
  search?: string;
  onSearchChange?: (v: string) => void;
  loading?: boolean;
  error?: string;
  defaultCreateOpen?: boolean;
  actions?: typeof defaultActions;
};

export function ApplicationsContent({
  search: searchProp,
  onSearchChange,
  loading: loadingOverride,
  error: errorOverride,
  defaultCreateOpen = false,
  actions = defaultActions,
}: ApplicationsContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const effectiveSearch = searchProp ?? internalSearch;
  const handleSearchChange = onSearchChange ?? setInternalSearch;

  const [createOpen, setCreateOpen] = useState(defaultCreateOpen);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createType, setCreateType] = useState<string>("confidential");

  const [editTarget, setEditTarget] = useState<OAuthClient | null>(null);
  const [editError, setEditError] = useState<string | undefined>();

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

  function buildClientPayload(formData: FormData) {
    const type = String(formData.get("type") ?? "confidential");
    const authMethod = String(formData.get("token_endpoint_auth_method") ?? "client_secret_post");
    const isM2M = type === "M2M";
    const isPublic = type === "public";
    const grant_types = isM2M
      ? ["client_credentials"]
      : ["authorization_code", "refresh_token"];
    const token_endpoint_auth_method = isM2M
      ? "client_secret_post"
      : isPublic
        ? "none"
        : authMethod;
    return {
      client_name: String(formData.get("client_name") ?? "").trim(),
      token_endpoint_auth_method,
      grant_types,
      response_types: isM2M ? [] : ["code"],
      public: isPublic,
      scope: scopeString(formData.get("scope")),
      redirect_uris: isM2M ? [] : splitDelimited(formData.get("redirect_uris")),
      post_logout_redirect_uris: splitDelimited(formData.get("post_logout_redirect_uris")),
      client_uri: optionalString(formData.get("client_uri")),
      logo_uri: optionalString(formData.get("logo_uri")),
      tos_uri: optionalString(formData.get("tos_uri")),
      policy_uri: optionalString(formData.get("policy_uri")),
      contacts: splitDelimited(formData.get("contacts")),
    };
  }

  async function handleCreate(formData: FormData) {
    setCreateError(undefined);
    try {
      const payload = buildClientPayload(formData);
      if (!payload.client_name) {
        setCreateError("Name is required");
        return false;
      }
      if (!payload.grant_types?.includes("client_credentials") && payload.redirect_uris.length === 0) {
        setCreateError("At least one redirect URI is required");
        return false;
      }
      const created = await actions.createClient(payload);
      await mutate();
      setCreateOpen(false);
      if (created.client_secret) setRevealSecret(created.client_secret);
      return true;
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create application");
      return false;
    }
  }

  async function handleEdit(formData: FormData) {
    if (!editTarget) return false;
    setEditError(undefined);
    try {
      const redirectUris = splitDelimited(formData.get("redirect_uris"));
      if (clientType(editTarget) !== "M2M" && redirectUris.length === 0) {
        setEditError("At least one redirect URI is required");
        return false;
      }
      await actions.updateClient(editTarget.client_id, {
        client_name: String(formData.get("client_name") ?? "").trim(),
        scope: scopeString(formData.get("scope")) ?? "",
        redirect_uris: redirectUris,
        post_logout_redirect_uris: splitDelimited(formData.get("post_logout_redirect_uris")),
        client_uri: optionalString(formData.get("client_uri")),
        logo_uri: optionalString(formData.get("logo_uri")),
        tos_uri: optionalString(formData.get("tos_uri")),
        policy_uri: optionalString(formData.get("policy_uri")),
        contacts: splitDelimited(formData.get("contacts")),
      });
      await mutate();
      setEditTarget(null);
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update application");
      return false;
    }
  }

  async function handleRotate() {
    if (!rotateTarget) return false;
    setRotateError(undefined);
    try {
      const { client_secret } = await actions.rotateClientSecret(rotateTarget.client_id);
      setRotateTarget(null);
      setRevealSecret(client_secret);
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
      await actions.deleteClient(deleteTarget.client_id);
      await mutate((cur) => (cur ?? []).filter((c) => c.client_id !== deleteTarget.client_id), { revalidate: false });
      setDeleteTarget(null);
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete application");
      return false;
    }
  }

  function renderList() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (displayed.length === 0) {
      if (effectiveSearch) {
        return <EmptyState message="No applications match your search" cta="Clear search" onCta={() => handleSearchChange("")} />;
      }
      return <EmptyState message="No OAuth applications" cta="Create Application" onCta={() => setCreateOpen(true)} />;
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
        render: (client) => {
          const type = clientType(client);
          return (
            <Inline gap="xs">
              <Button size="sm" variant="secondary" iconName="Pencil" ariaLabel={`Edit ${client.client_name}`} onClick={() => { setEditError(undefined); setEditTarget(client); }} />
              {type !== "public" ? (
                <Button size="sm" variant="secondary" iconName="RefreshCw" ariaLabel={`Rotate secret for ${client.client_name}`} onClick={() => { setRotateError(undefined); setRotateTarget(client); }} />
              ) : null}
              <Button size="sm" variant="danger" iconName="Trash2" ariaLabel={`Delete ${client.client_name}`} onClick={() => { setDeleteError(undefined); setDeleteTarget(client); }} />
            </Inline>
          );
        },
      },
    ];

    return (
      <Panel padding="none">
        <DataTable<OAuthClient>
          columns={columns}
          rows={displayed}
          getRowKey={(client) => client.client_id}
        />
      </Panel>
    );
  }

  return (
    <Stack gap="md">
      <Panel>
        <Stack gap="sm">
          <Text variant="h2">OAuth Applications</Text>
          <Inline gap="sm">
            <SearchInput grow placeholder="Search applications…" value={effectiveSearch} onChange={handleSearchChange} />
            <Button variant="primary" iconName="Plus" onClick={() => { setCreateError(undefined); setCreateType("confidential"); setCreateOpen(true); }}>New App</Button>
          </Inline>
        </Stack>
      </Panel>

      {renderList()}

      <ConfirmDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateError(undefined); }}
        title="Create OAuth Application"
        description={typeDescription(createType)}
        confirmLabel="Create"
        error={createError}
        onConfirm={handleCreate}
      >
        <RadioGroup
          title="Application Type"
          name="type"
          value={createType}
          onChange={setCreateType}
          options={[
            { value: "confidential", label: "Web server" },
            { value: "public", label: "SPA / native" },
            { value: "M2M", label: "Machine-to-machine" },
          ]}
        />
        <TextInput label="Name" name="client_name" required />
        {createType === "confidential" ? (
          <RadioGroup
            title="Token Auth Method"
            name="token_endpoint_auth_method"
            defaultValue="client_secret_post"
            options={[
              { value: "client_secret_post", label: "client_secret_post" },
              { value: "client_secret_basic", label: "client_secret_basic" },
            ]}
          />
        ) : null}
        <Tabs
          ariaLabel="New application settings"
          size="sm"
          items={[
            {
              id: "access",
              label: "Access",
              content: (
                <Stack gap="sm">
                  <Textarea label="Scopes" name="scope" rows={2} placeholder="openid profile email" />
                  {createType !== "M2M" ? (
                    <RedirectUriFields withPlaceholders />
                  ) : null}
                </Stack>
              ),
            },
            {
              id: "metadata",
              label: "Metadata",
              content: <ClientMetadataFields />,
            },
          ]}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => { if (!o) { setEditTarget(null); setEditError(undefined); } }}
        title="Edit Application"
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        {editTarget ? (
          <Stack gap="sm">
            <Inline gap="sm" wrap>
              <Badge tone={typeBadgeTone[clientType(editTarget)]} size="sm">{typeLabel[clientType(editTarget)]}</Badge>
              <Text variant="caption" mono>{editTarget.client_id}</Text>
            </Inline>
            <TextInput label="Name" name="client_name" defaultValue={editTarget.client_name} required />
            <Tabs
              ariaLabel="Application settings"
              size="sm"
              items={[
                {
                  id: "access",
                  label: "Access",
                  content: (
                    <Stack gap="sm">
                      <Textarea label="Scopes" name="scope" rows={2} defaultValue={editTarget.scope} />
                      {clientType(editTarget) !== "M2M" ? (
                        <RedirectUriFields
                          redirectUris={editTarget.redirect_uris}
                          postLogoutRedirectUris={editTarget.post_logout_redirect_uris}
                        />
                      ) : null}
                    </Stack>
                  ),
                },
                {
                  id: "metadata",
                  label: "Metadata",
                  content: <ClientMetadataFields client={editTarget} />,
                },
              ]}
            />
          </Stack>
        ) : null}
      </ConfirmDialog>

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
            <Button size="sm" variant="secondary" iconName="Copy" onClick={() => { if (revealSecret) void copyToClipboard(revealSecret); }}>
              Copy
            </Button>
          }
        />
      </ConfirmDialog>
    </Stack>
  );
}
