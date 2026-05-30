"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Badge,
  Button,
  CodeBlock,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  DescriptionList,
  EmptyState,
  ErrorAlert,
  Inline,
  Menu,
  MenuItem,
  MenuTrigger,
  Panel,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  Tabs,
  Text,
  Textarea,
  TextInput,
  toast,
} from "@id/ui";
import {
  clientType,
  listBindings as listBindingsAction,
  listClients as listClientsAction,
  listResourceServers as listResourceServersAction,
  updateClient as updateClientAction,
  rotateClientSecret as rotateClientSecretAction,
  deleteClient as deleteClientAction,
  type ClientResourceScope,
  type NonEmptyStringArray,
  type OAuthClient,
  type ResourceServer,
  type UpdateClientInput,
} from "../../_actions/oauth";
import { AdminDetailTitleRow } from "../admin-detail-title-row";
import { ActivityLogContent } from "../activity-log-content";
import { copyToClipboard } from "@/shared/clipboard";
import { isM2mBindingsKey, m2mBindingsKey, oauthClientsKey, resourceServersKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listClients: listClientsAction,
  listBindings: listBindingsAction,
  listResourceServers: listResourceServersAction,
  updateClient: updateClientAction,
  rotateClientSecret: rotateClientSecretAction,
  deleteClient: deleteClientAction,
};

const typeBadgeTone = {
  confidential: "neutral",
  public: "info",
  M2M: "accent",
} as const;

const typeLabel = {
  confidential: "Confidential",
  public: "Public",
  M2M: "M2M",
} as const;

export type ApplicationDetailTab = "overview" | "credentials" | "uris" | "scopes" | "connections" | "quickstart" | "audit";

type ApplicationDetailContentProps = {
  readonly clientId: string;
  readonly activeTab?: ApplicationDetailTab;
  readonly loading?: boolean;
  readonly error?: string;
  readonly onDeleted?: () => void;
  readonly actions?: typeof defaultActions;
};

function tabs(clientId: string) {
  return [
    { id: "overview", href: `/admin/oauth/applications/${clientId}`, label: "Overview" },
    { id: "credentials", href: `/admin/oauth/applications/${clientId}/credentials`, label: "Credentials" },
    { id: "uris", href: `/admin/oauth/applications/${clientId}/uris`, label: "URIs" },
    { id: "scopes", href: `/admin/oauth/applications/${clientId}/scopes`, label: "Scopes & Grants" },
    { id: "connections", href: `/admin/oauth/applications/${clientId}/connections`, label: "Connections" },
    { id: "quickstart", href: `/admin/oauth/applications/${clientId}/quickstart`, label: "Quickstart" },
    { id: "audit", href: `/admin/oauth/applications/${clientId}/audit`, label: "Audit" },
  ];
}

function scopeList(scope: string | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

function splitDelimited(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function scopeString(raw: FormDataEntryValue | null): string {
  return String(raw ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function optionalString(raw: FormDataEntryValue | null): string | undefined {
  return String(raw ?? "").trim() || undefined;
}

function toNonEmptyArray(values: readonly string[]): NonEmptyStringArray | undefined {
  const [first, ...rest] = values;
  return first ? [first, ...rest] : undefined;
}

function formatList(values: readonly string[] | undefined): string {
  return values && values.length > 0 ? values.join("\n") : "None";
}

async function copyText(value: string, label: string) {
  const ok = await copyToClipboard(value);
  if (ok) toast.success(`${label} copied`);
  else toast.error("Couldn't copy", `Copy the ${label.toLowerCase()} manually.`);
}

function RedirectUriFields({
  redirectUris,
  postLogoutRedirectUris,
}: {
  readonly redirectUris?: readonly string[];
  readonly postLogoutRedirectUris?: readonly string[];
}) {
  return (
    <>
      <Textarea label="Redirect URIs" name="redirect_uris" rows={3} defaultValue={redirectUris?.join("\n")} required />
      <Textarea label="Post-Logout Redirect URIs" name="post_logout_redirect_uris" rows={2} defaultValue={postLogoutRedirectUris?.join("\n")} />
    </>
  );
}

function ClientMetadataFields({ client }: { readonly client: OAuthClient }) {
  return (
    <Stack gap="sm">
      <TextInput label="Client URI" name="client_uri" defaultValue={client.client_uri ?? ""} />
      <TextInput label="Logo URI" name="logo_uri" defaultValue={client.logo_uri ?? ""} />
      <TextInput label="Terms URI" name="tos_uri" defaultValue={client.tos_uri ?? ""} />
      <TextInput label="Policy URI" name="policy_uri" defaultValue={client.policy_uri ?? ""} />
      <Textarea label="Contacts" name="contacts" rows={2} defaultValue={client.contacts?.join("\n")} />
    </Stack>
  );
}

function Header({
  client,
  clientId,
  activeTab,
  onEdit,
  onRotate,
  onDelete,
}: {
  readonly client: OAuthClient | undefined;
  readonly clientId: string;
  readonly activeTab: ApplicationDetailTab;
  readonly onEdit?: () => void;
  readonly onRotate?: () => void;
  readonly onDelete?: () => void;
}) {
  const type = client ? clientType(client) : "confidential";
  return (
    <Stack gap="sm">
      <Inline justify="between">
        <AdminDetailTitleRow
          backHref="/admin/oauth/applications"
          backLabel="OAuth Applications"
          title={client?.client_name ?? clientId}
        >
          {client ? <Badge tone={typeBadgeTone[type]}>{typeLabel[type]}</Badge> : null}
          <Text variant="caption" mono>{clientId}</Text>
        </AdminDetailTitleRow>
        {client ? (
          <Inline gap="sm" justify="end">
            <Button variant="secondary" hideOnMobile iconName="Pencil" onClick={onEdit}>
              Edit Application
            </Button>
            {type !== "public" ? (
              <Button variant="secondary" hideOnMobile iconName="RefreshCw" onClick={onRotate}>
                Rotate Secret
              </Button>
            ) : null}
            <Button variant="danger" hideOnMobile iconName="Trash2" onClick={onDelete}>
              Delete
            </Button>
            <MenuTrigger>
              <Button variant="ghost" size="sm" hideOnDesktop iconName="Ellipsis" ariaLabel="Actions" tooltip="More actions" />
              <Menu onAction={(key) => {
                if (key === "edit") onEdit?.();
                if (key === "rotate") onRotate?.();
                if (key === "delete") onDelete?.();
              }}>
                <MenuItem id="edit">Edit Application</MenuItem>
                {type !== "public" ? <MenuItem id="rotate">Rotate Secret</MenuItem> : null}
                <MenuItem id="delete">Delete</MenuItem>
              </Menu>
            </MenuTrigger>
          </Inline>
        ) : null}
      </Inline>
      <Tabs ariaLabel="OAuth application detail tabs" selectedKey={activeTab} items={tabs(clientId)} />
    </Stack>
  );
}

function Overview({ client }: { readonly client: OAuthClient }) {
  const type = clientType(client);
  return (
    <Panel>
      <DescriptionList
        columns={2}
        items={[
          { term: "Application", description: client.client_name },
          { term: "Type", description: <Badge tone={typeBadgeTone[type]}>{typeLabel[type]}</Badge> },
          { term: "Client ID", description: client.client_id, mono: true },
          { term: "Status", description: client.disabled ? <Badge tone="error">Disabled</Badge> : <Badge tone="success">Enabled</Badge> },
          { term: "Token auth method", description: client.token_endpoint_auth_method, mono: true },
          { term: "Client URI", description: client.client_uri ?? "None" },
          { term: "Logo URI", description: client.logo_uri ?? "None" },
          { term: "Contacts", description: formatList(client.contacts) },
        ]}
      />
    </Panel>
  );
}

function Credentials({ client }: { readonly client: OAuthClient }) {
  const type = clientType(client);
  return (
    <Panel>
      <Stack gap="md">
        <DescriptionList
          columns={2}
          items={[
            { term: "Client ID", description: client.client_id, mono: true },
            { term: "Secret", description: type === "public" ? "No secret; this client uses PKCE." : "Stored server-side; shown only on create or rotate." },
            { term: "Token auth method", description: client.token_endpoint_auth_method, mono: true },
            { term: "Response types", description: client.response_types.length > 0 ? client.response_types.join(", ") : "None" },
          ]}
        />
        <Inline>
          <Button variant="secondary" iconName="Copy" onClick={() => void copyText(client.client_id, "Client ID")}>
            Copy client ID
          </Button>
        </Inline>
      </Stack>
    </Panel>
  );
}

function UriList({ title, values }: { readonly title: string; readonly values: readonly string[] | undefined }) {
  return (
    <Stack gap="xs">
      <Text variant="h3">{title}</Text>
      {values && values.length > 0 ? values.map((uri) => <Text key={uri} variant="body" mono>{uri}</Text>) : <Text variant="caption">None</Text>}
    </Stack>
  );
}

function Uris({ client }: { readonly client: OAuthClient }) {
  return (
    <Panel>
      <Stack gap="md">
        <UriList title="Redirect URIs" values={client.redirect_uris} />
        <UriList title="Post-Logout Redirect URIs" values={client.post_logout_redirect_uris} />
      </Stack>
    </Panel>
  );
}

function ScopesAndGrants({ client }: { readonly client: OAuthClient }) {
  const scopes = scopeList(client.scope);
  return (
    <Panel>
      <Stack gap="md">
        <Stack gap="xs">
          <Text variant="h3">Scopes</Text>
          <Inline gap="xs" wrap>
            {scopes.length > 0 ? scopes.map((scope) => <Badge key={scope} tone="primary" size="sm">{scope}</Badge>) : <Text variant="caption">No default scopes</Text>}
          </Inline>
        </Stack>
        <Stack gap="xs">
          <Text variant="h3">Grant Types</Text>
          <Inline gap="xs" wrap>
            {client.grant_types.map((grant) => <Badge key={grant} tone="neutral" size="sm">{grant}</Badge>)}
          </Inline>
        </Stack>
      </Stack>
    </Panel>
  );
}

function Connections({ client, actions }: { readonly client: OAuthClient; readonly actions: typeof defaultActions }) {
  const { data: bindings, isLoading, error, mutate } = useSWR(m2mBindingsKey(), () => actions.listBindings());
  const { data: servers } = useSWR(resourceServersKey(), () => actions.listResourceServers());
  const serverById = new Map((servers ?? []).map((server: ResourceServer) => [server.id, server.name]));
  const rows = (bindings ?? []).filter((binding) => binding.clientId === client.client_id);
  const requestedScopes = scopeList(client.scope);
  const activeAllowedScopes = new Set(rows.filter((binding) => binding.enabled).flatMap((binding) => binding.allowedScopes));
  const coveredScopes = requestedScopes.filter((scope) => activeAllowedScopes.has(scope)).length;
  const disabledBindings = rows.filter((binding) => !binding.enabled).length;
  const columns: DataTableColumn<ClientResourceScope>[] = [
    { key: "resourceServerId", label: "Resource API", render: (binding) => serverById.get(binding.resourceServerId) ?? binding.resourceServerId },
    {
      key: "allowedScopes",
      label: "Allowed Scopes",
      render: (binding) => (
        <Inline gap="xs" wrap>
          {binding.allowedScopes.map((scope) => <Badge key={scope} tone="primary" size="sm">{scope}</Badge>)}
        </Inline>
      ),
    },
    { key: "enabled", label: "Status", render: (binding) => binding.enabled ? <Badge tone="success" size="sm">Active</Badge> : <Badge tone="error" size="sm">Disabled</Badge> },
  ];
  if (isLoading) return <Skeleton rows={4} />;
  if (error) return <ErrorAlert message={error instanceof Error ? error.message : String(error)} onRetry={() => void mutate()} />;
  return (
    <Stack gap="md">
      <StatGroup columns={4}>
        <Stat title="Resource APIs" value={rows.length} description="bound resources" />
        <Stat title="Allowed Scopes" value={activeAllowedScopes.size} description="effective M2M scopes" tone="primary" />
        <Stat title="Requested Covered" value={`${coveredScopes}/${requestedScopes.length}`} description="client default scopes" tone={coveredScopes === requestedScopes.length ? "success" : "warning"} />
        <Stat title="Disabled Bindings" value={disabledBindings} description="excluded from access" tone={disabledBindings > 0 ? "warning" : "neutral"} />
      </StatGroup>
      <Panel padding={rows.length > 0 ? "none" : "md"}>
        {rows.length === 0
          ? <EmptyState message="No resource API connections for this application" />
          : <DataTable<ClientResourceScope> columns={columns} rows={rows} getRowKey={(binding) => binding.id} />}
      </Panel>
    </Stack>
  );
}

function Quickstart({ client }: { readonly client: OAuthClient }) {
  const issuer = typeof window === "undefined" ? "https://id.example.com" : window.location.origin;
  const type = clientType(client);
  const snippet = type === "M2M"
    ? `curl -X POST ${issuer}/api/auth/oauth2/token \\\n  -u "${client.client_id}:<client_secret>" \\\n  -d "grant_type=client_credentials" \\\n  -d "scope=${client.scope || "<scope>"}"`
    : `${issuer}/api/auth/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(client.client_id)}&redirect_uri=${encodeURIComponent(client.redirect_uris[0] ?? "https://app.example.com/callback")}&scope=${encodeURIComponent(client.scope || "openid profile")}&code_challenge=<challenge>&code_challenge_method=S256`;
  return (
    <Stack gap="md">
      <CodeBlock label={type === "M2M" ? "Client credentials token request" : "Authorization URL"} value={snippet} action={<Button size="sm" variant="secondary" iconName="Copy" onClick={() => void copyText(snippet, "Quickstart snippet")}>Copy</Button>} />
      <CodeBlock label="Discovery" value={`${issuer}/api/auth/.well-known/openid-configuration`} maxHeight="sm" />
    </Stack>
  );
}

function renderTab(activeTab: ApplicationDetailTab, client: OAuthClient, actions: typeof defaultActions) {
  if (activeTab === "credentials") return <Credentials client={client} />;
  if (activeTab === "uris") return <Uris client={client} />;
  if (activeTab === "scopes") return <ScopesAndGrants client={client} />;
  if (activeTab === "connections") return <Connections client={client} actions={actions} />;
  if (activeTab === "quickstart") return <Quickstart client={client} />;
  if (activeTab === "audit") return <ActivityLogContent targetType="oauth_client" targetId={client.client_id} />;
  return <Overview client={client} />;
}

export function ApplicationDetailContent({
  clientId,
  activeTab = "overview",
  loading: loadingOverride,
  error: errorOverride,
  onDeleted,
  actions = defaultActions,
}: ApplicationDetailContentProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateError, setRotateError] = useState<string | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [revealSecret, setRevealSecret] = useState<string | undefined>();
  const { mutate: globalMutate } = useSWRConfig();

  const { data: clients, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : oauthClientsKey(),
    () => actions.listClients(),
  );
  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const client = clients?.find((item) => item.client_id === clientId);

  async function handleEdit(formData: FormData) {
    if (!client) return false;
    setEditError(undefined);
    try {
      const type = clientType(client);
      const redirectUris = splitDelimited(formData.get("redirect_uris"));
      const redirectUriInput = toNonEmptyArray(redirectUris);
      if (type !== "M2M" && !redirectUriInput) {
        setEditError("At least one redirect URI is required");
        return false;
      }
      const postLogoutRaw = String(formData.get("post_logout_redirect_uris") ?? "").trim();
      const contactsRaw = String(formData.get("contacts") ?? "").trim();
      if (client.post_logout_redirect_uris?.length && !postLogoutRaw) {
        setEditError("This update route cannot clear post-logout redirect URIs.");
        return false;
      }
      if (client.contacts?.length && !contactsRaw) {
        setEditError("This update route cannot clear contacts.");
        return false;
      }
      const postLogoutUriInput = toNonEmptyArray(splitDelimited(formData.get("post_logout_redirect_uris")));
      const contactsInput = toNonEmptyArray(splitDelimited(formData.get("contacts")));
      const update: UpdateClientInput = {
        client_name: String(formData.get("client_name") ?? "").trim(),
        scope: scopeString(formData.get("scope")),
        client_uri: optionalString(formData.get("client_uri")),
        logo_uri: optionalString(formData.get("logo_uri")),
        tos_uri: optionalString(formData.get("tos_uri")),
        policy_uri: optionalString(formData.get("policy_uri")),
      };
      if (redirectUriInput) update.redirect_uris = redirectUriInput;
      if (postLogoutUriInput) update.post_logout_redirect_uris = postLogoutUriInput;
      if (contactsInput) update.contacts = contactsInput;
      const updated = await actions.updateClient(client.client_id, update);
      await mutate((current) => (current ?? []).map((item) => item.client_id === updated.client_id ? updated : item), { revalidate: false });
      setEditOpen(false);
      toast.success("Application updated");
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update application");
      return false;
    }
  }

  async function handleRotate() {
    if (!client) return false;
    setRotateError(undefined);
    try {
      const { client_secret } = await actions.rotateClientSecret(client.client_id);
      setRotateOpen(false);
      setRevealSecret(client_secret);
      toast.success("Secret rotated", "The previous secret is now invalid. Update your app config.");
      return true;
    } catch (err: unknown) {
      setRotateError(err instanceof Error ? err.message : "Failed to rotate secret");
      return false;
    }
  }

  async function handleDelete() {
    if (!client) return false;
    setDeleteError(undefined);
    try {
      await actions.deleteClient(client.client_id);
      await mutate((current) => (current ?? []).filter((item) => item.client_id !== client.client_id), { revalidate: false });
      await globalMutate(isM2mBindingsKey, undefined, { revalidate: false });
      setDeleteOpen(false);
      toast.success("Application deleted", `${client.client_name} and its tokens were revoked.`);
      onDeleted?.();
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete application");
      return false;
    }
  }

  if (showLoading) {
    return (
      <Stack gap="md">
        <Header client={undefined} clientId={clientId} activeTab={activeTab} />
        <Skeleton rows={6} />
      </Stack>
    );
  }

  if (showError) {
    return (
      <Stack gap="md">
        <Header client={undefined} clientId={clientId} activeTab={activeTab} />
        <ErrorAlert message={showError} onRetry={() => void mutate()} />
      </Stack>
    );
  }

  if (!client) {
    return (
      <Stack gap="md">
        <Header client={undefined} clientId={clientId} activeTab={activeTab} />
        <ErrorAlert message="Application not found" onRetry={() => void mutate()} />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Header
        client={client}
        clientId={clientId}
        activeTab={activeTab}
        onEdit={() => setEditOpen(true)}
        onRotate={() => { setRotateError(undefined); setRotateOpen(true); }}
        onDelete={() => { setDeleteError(undefined); setDeleteOpen(true); }}
      />
      {renderTab(activeTab, client, actions)}
      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditError(undefined); }}
        title="Edit Application"
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <Stack gap="sm">
          <Inline gap="sm" wrap>
            <Badge tone={typeBadgeTone[clientType(client)]} size="sm">{typeLabel[clientType(client)]}</Badge>
            <Text variant="caption" mono>{client.client_id}</Text>
          </Inline>
          <TextInput label="Name" name="client_name" defaultValue={client.client_name} required />
          <Tabs
            ariaLabel="Application settings"
            size="sm"
            items={[
              {
                id: "access",
                label: "Access",
                content: (
                  <Stack gap="sm">
                    <Textarea label="Scopes" name="scope" rows={2} defaultValue={client.scope} />
                    {clientType(client) !== "M2M" ? (
                      <RedirectUriFields
                        redirectUris={client.redirect_uris}
                        postLogoutRedirectUris={client.post_logout_redirect_uris}
                      />
                    ) : null}
                  </Stack>
                ),
              },
              {
                id: "metadata",
                label: "Metadata",
                content: <ClientMetadataFields client={client} />,
              },
            ]}
          />
        </Stack>
      </ConfirmDialog>
      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={(o) => { setRotateOpen(o); if (!o) setRotateError(undefined); }}
        title="Rotate Client Secret"
        description={`This invalidates the current secret for ${client.client_name} immediately. Make sure to update your application config.`}
        confirmLabel="Rotate"
        variant="danger"
        error={rotateError}
        onConfirm={handleRotate}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteError(undefined); }}
        title="Delete Application"
        description={`Delete ${client.client_name}? This invalidates all tokens issued for this client and breaks every integration using it.`}
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
              void copyText(revealSecret, "Secret");
            }}>
              Copy
            </Button>
          }
        />
      </ConfirmDialog>
    </Stack>
  );
}
