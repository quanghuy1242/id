"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { ActiveScope } from "@id/lib";
import {
  Button,
  CodeBlock,
  ConfirmDialog,
  DescriptionList,
  ErrorAlert,
  Panel,
  RadioGroup,
  ScopeBuilder,
  type ScopeSuggestion,
  Stack,
  Stepper,
  Text,
  TextInput,
  UrlListBuilder,
  toast,
} from "@id/ui";
import {
  createClient as createClientAction,
  listScopes as listScopesAction,
  type OAuthClient,
  type NonEmptyStringArray,
} from "../../_actions/oauth";
import { AdminDetailTitleRow } from "../admin-detail-title-row";
import { copyToClipboard } from "@/shared/clipboard";
import { oauthScopesKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  createClient: createClientAction,
  listScopes: listScopesAction,
};

const platformScope: ActiveScope = { kind: "platform" };

type ApplicationKind = "confidential" | "public" | "M2M";

type ApplicationCreateWizardContentProps = {
  readonly scope?: ActiveScope;
  readonly onCreated?: (clientId: string) => void;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly title?: string;
  readonly defaultKind?: ApplicationKind;
  readonly completeLabel?: string;
  readonly actions?: typeof defaultActions;
};

function kindDescription(kind: ApplicationKind): string {
  if (kind === "M2M") return "Machine-to-machine client using the client credentials flow.";
  if (kind === "public") return "Public client using authorization code with PKCE and no client secret.";
  return "Server-side web application using authorization code with a client secret.";
}

function toNonEmptyArray(values: readonly string[]): NonEmptyStringArray | undefined {
  const [first, ...rest] = values;
  return first ? [first, ...rest] : undefined;
}

export function ApplicationCreateWizardContent({
  scope = platformScope,
  onCreated,
  backHref = "/admin/platform/oauth/applications",
  backLabel = "OAuth Applications",
  title = "New OAuth Application",
  defaultKind = "confidential",
  completeLabel = "Create application",
  actions = defaultActions,
}: ApplicationCreateWizardContentProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [kind, setKind] = useState<ApplicationKind>(defaultKind);
  const [name, setName] = useState("");
  const [authMethod, setAuthMethod] = useState("client_secret_post");
  const [redirectUris, setRedirectUris] = useState<string[]>([""]);
  const [postLogoutRedirectUris, setPostLogoutRedirectUris] = useState<string[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [created, setCreated] = useState<OAuthClient | null>(null);
  const [revealSecret, setRevealSecret] = useState<string | undefined>();
  const completedRef = useRef(false);

  const { data: catalog } = useSWR(oauthScopesKey(scope), () => actions.listScopes(scope));
  const suggestions: ScopeSuggestion[] = useMemo(
    () => (catalog ?? []).map((catalogScope) => ({ value: catalogScope.scope, description: catalogScope.description ?? undefined, group: catalogScope.resourceServerId })),
    [catalog],
  );

  const cleanedRedirects = redirectUris.map((uri) => uri.trim()).filter(Boolean);
  const cleanedPostLogout = postLogoutRedirectUris.map((uri) => uri.trim()).filter(Boolean);
  const nameValid = name.trim().length > 0;
  const urisValid = cleanedRedirects.length > 0;
  const forcedAuthMethod = kind === "public" ? "none" : "client_secret_post";
  const effectiveAuthMethod = kind === "confidential" ? authMethod : forcedAuthMethod;

  async function handleCreate() {
    setSubmitError(undefined);
    if (!nameValid) {
      setSubmitError("Name is required");
      setActiveStep(0);
      return;
    }
    const redirectUriInput = toNonEmptyArray(cleanedRedirects);
    if (!redirectUriInput) {
      setSubmitError("At least one redirect URI is required");
      setActiveStep(2);
      return;
    }
    try {
      const isM2M = kind === "M2M";
      const postLogoutUriInput = toNonEmptyArray(cleanedPostLogout);
      const result = await actions.createClient({
        client_name: name.trim(),
        token_endpoint_auth_method: effectiveAuthMethod,
        grant_types: isM2M ? ["client_credentials"] : ["authorization_code", "refresh_token"],
        response_types: isM2M ? [] : ["code"],
        redirect_uris: redirectUriInput,
        ...(postLogoutUriInput ? { post_logout_redirect_uris: postLogoutUriInput } : {}),
        scope: scopes.length > 0 ? scopes.join(" ") : undefined,
      }, scope);
      completedRef.current = false;
      setCreated(result);
      if (result.client_secret) setRevealSecret(result.client_secret);
      else onCreated?.(result.client_id);
      toast.success("Application created", `${result.client_name} is registered.`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create application");
    }
  }

  function completeCreatedNavigation() {
    if (!created || completedRef.current) return;
    completedRef.current = true;
    setRevealSecret(undefined);
    onCreated?.(created.client_id);
  }

  const steps = [
    {
      id: "type",
      label: "Type",
      isValid: nameValid,
      content: (
        <Panel>
          <Stack gap="md">
            <TextInput label="Name" name="client_name" required defaultValue={name} onChange={setName} />
            <RadioGroup
              title="Application Type"
              name="type"
              value={kind}
              onChange={(next) => setKind(next as ApplicationKind)}
              options={[
                { value: "confidential", label: "Web server" },
                { value: "public", label: "SPA / native" },
                { value: "M2M", label: "Machine-to-machine" },
              ]}
            />
            <Text variant="caption">{kindDescription(kind)}</Text>
          </Stack>
        </Panel>
      ),
    },
    {
      id: "auth",
      label: "Auth",
      content: (
        <Panel>
          {kind === "confidential" ? (
            <RadioGroup
              title="Token Auth Method"
              name="token_endpoint_auth_method"
              value={authMethod}
              onChange={setAuthMethod}
              options={[
                { value: "client_secret_post", label: "client_secret_post" },
                { value: "client_secret_basic", label: "client_secret_basic" },
              ]}
            />
          ) : (
            <Text variant="body">{kind === "public" ? "Public clients use PKCE with no client secret." : "M2M clients use client_secret_post and the client credentials grant."}</Text>
          )}
        </Panel>
      ),
    },
    {
      id: "uris",
      label: "URIs",
      isValid: urisValid,
      content: (
        <Panel>
          <Stack gap="md">
            {kind === "M2M" ? (
              <Text variant="body">Client registration requires one registered redirect URI; client credentials token requests do not use it.</Text>
            ) : null}
            <UrlListBuilder label="Redirect URIs" value={redirectUris} onChange={setRedirectUris} placeholder="https://app.example.com/callback" />
            {kind === "M2M" ? null : (
              <UrlListBuilder label="Post-Logout Redirect URIs" value={postLogoutRedirectUris} onChange={setPostLogoutRedirectUris} placeholder="https://app.example.com/signed-out" minRows={0} />
            )}
          </Stack>
        </Panel>
      ),
    },
    {
      id: "scopes",
      label: "Scopes",
      content: (
        <Panel>
          <ScopeBuilder label="Scopes" value={scopes} onChange={setScopes} suggestions={suggestions} allowCustom name="scope" />
        </Panel>
      ),
    },
    {
      id: "review",
      label: "Review",
      content: (
        <Panel>
          <DescriptionList
            columns={2}
            items={[
              { term: "Name", description: name || "Not set" },
              { term: "Type", description: kindDescription(kind) },
              { term: "Token auth method", description: effectiveAuthMethod, mono: true },
              { term: "Grant types", description: kind === "M2M" ? "client_credentials" : "authorization_code, refresh_token" },
              { term: "Redirect URIs", description: cleanedRedirects.join("\n") || "None", mono: cleanedRedirects.length > 0 },
              { term: "Scopes", description: scopes.length > 0 ? scopes.join(" ") : "None", mono: scopes.length > 0 },
            ]}
          />
        </Panel>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <AdminDetailTitleRow
        backHref={backHref}
        backLabel={backLabel}
        title={title}
      />
      {submitError ? <ErrorAlert message={submitError} /> : null}
      <Stepper
        steps={steps}
        activeStep={activeStep}
        onStepChange={setActiveStep}
        onComplete={handleCreate}
        completeLabel={completeLabel}
      />
      <ConfirmDialog
        open={Boolean(revealSecret)}
        onOpenChange={(open) => {
          if (!open) {
            completeCreatedNavigation();
          }
        }}
        title="Client Secret"
        description="Copy this secret now — it is shown only once and cannot be retrieved later."
        confirmLabel="Done"
        cancelLabel="Close"
        onConfirm={() => {
          completeCreatedNavigation();
          return true;
        }}
      >
        <CodeBlock
          label="Secret"
          value={revealSecret ?? ""}
          maxHeight="sm"
          action={
            <ButtonCopySecret secret={revealSecret ?? ""} />
          }
        />
      </ConfirmDialog>
    </Stack>
  );
}

function ButtonCopySecret({ secret }: { readonly secret: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      iconName="Copy"
      onClick={() => {
        void (async () => {
          const ok = await copyToClipboard(secret);
          if (ok) toast.success("Secret copied", "Store it securely.");
          else toast.error("Couldn't copy", "Copy the secret manually before closing.");
        })();
      }}
    >
      Copy
    </Button>
  );
}
