"use client";

import {
  ConfirmDialog,
  DateTimeInput,
  Grid,
  NumberInput,
  RadioGroup,
  ResourceSelector,
  type ResourceOption,
  ScopeBuilder,
  type ScopeSuggestion,
  Switch,
  TagInput,
  TextInput,
  defaultDomainValidate,
} from "@idco/ui";
import type { ActiveScope } from "@idco/lib";
import type {
  RegistrationPolicy,
  RegistrationPolicyFormInput,
} from "../../_actions/registration-policies";

const modeOptions = [
  { value: "client_initiated", label: "Client initiated" },
  { value: "invite_only", label: "Invite only" },
  { value: "public_limited", label: "Public limited" },
];
const quotaTargetOptions = [
  { value: "memberships", label: "Memberships" },
  { value: "accounts", label: "Accounts" },
];

export type PolicyDialogState =
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly policy: RegistrationPolicy };

export type PolicyFormState = {
  readonly clientId: string;
  readonly organizationId: string;
  readonly resourceServerId: string;
  readonly allowedScopes: string[];
  readonly emailDomains: string[];
  readonly defaultTeamIds: string[];
  readonly quotaLimit: number | null;
  readonly startsAt: number | null;
  readonly expiresAt: number | null;
  readonly requiresEmailVerification: boolean;
};

export function initialFormState(policy: RegistrationPolicy | null, scope: ActiveScope): PolicyFormState {
  const scopedOrg = scope.kind === "organization" ? scope.organizationId : "";
  return {
    clientId: policy?.clientId ?? "",
    organizationId: policy?.organizationId ?? scopedOrg,
    resourceServerId: policy?.resourceServerId ?? "",
    allowedScopes: policy ? [...policy.allowedScopes] : [],
    emailDomains: policy ? [...policy.emailDomains] : [],
    defaultTeamIds: policy ? [...policy.defaultTeamIds] : [],
    quotaLimit: policy?.quotaLimit ?? null,
    startsAt: policy?.startsAt ?? null,
    expiresAt: policy?.expiresAt ?? null,
    requiresEmailVerification: policy?.requiresEmailVerification ?? true,
  };
}

function textValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: FormDataEntryValue | null): string | null {
  const text = textValue(value);
  return text ? text : null;
}

function splitList(value: FormDataEntryValue | null): string[] {
  const text = textValue(value);
  if (!text) return [];
  return text.split(/[\s,]+/u).map((entry) => entry.trim()).filter(Boolean);
}

// Identifiers, scopes, and domains come from the picker hidden inputs (FormData);
// number/date/toggle values are read from the controlled form state.
export function policyInputFromForm(formData: FormData, form: PolicyFormState): RegistrationPolicyFormInput {
  const name = textValue(formData.get("name"));
  const slug = textValue(formData.get("slug"));
  if (!name) throw new Error("Name is required.");
  if (!slug) throw new Error("Slug is required.");
  return {
    slug,
    name,
    mode: textValue(formData.get("mode")) || "client_initiated",
    clientId: nullableText(formData.get("clientId")),
    organizationId: nullableText(formData.get("organizationId")),
    resourceServerId: nullableText(formData.get("resourceServerId")),
    allowedScopes: splitList(formData.get("allowedScopes")),
    emailDomains: splitList(formData.get("emailDomains")),
    defaultRole: "member",
    defaultTeamIds: splitList(formData.get("defaultTeamIds")),
    quotaLimit: form.quotaLimit,
    quotaTarget: (textValue(formData.get("quotaTarget")) || "memberships") as "accounts" | "memberships",
    requiresEmailVerification: form.requiresEmailVerification,
    startsAt: form.startsAt,
    expiresAt: form.expiresAt,
  };
}

export function PolicyDialog({
  state,
  form,
  setField,
  error,
  initialClientOptions,
  initialOrganizationOptions,
  initialResourceServerOptions,
  initialTeamOptions,
  loadClients,
  loadOrganizations,
  loadResourceServers,
  loadTeams,
  scopeSuggestions,
  scopeSearch,
  onScopeSearchChange,
  onOpenChange,
  onConfirm,
}: {
  readonly state: PolicyDialogState | null;
  readonly form: PolicyFormState;
  readonly setField: <K extends keyof PolicyFormState>(key: K, value: PolicyFormState[K]) => void;
  readonly error?: string;
  readonly initialClientOptions: ResourceOption[];
  readonly initialOrganizationOptions: ResourceOption[];
  readonly initialResourceServerOptions: ResourceOption[];
  readonly initialTeamOptions: ResourceOption[];
  readonly loadClients: (query: string, signal: AbortSignal) => Promise<ResourceOption[]>;
  readonly loadOrganizations: (query: string, signal: AbortSignal) => Promise<ResourceOption[]>;
  readonly loadResourceServers: (query: string, signal: AbortSignal) => Promise<ResourceOption[]>;
  readonly loadTeams: (query: string, signal: AbortSignal) => Promise<ResourceOption[]>;
  readonly scopeSuggestions: ScopeSuggestion[];
  readonly scopeSearch: string;
  readonly onScopeSearchChange: (value: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (formData: FormData) => Promise<boolean>;
}) {
  const policy = state?.mode === "edit" ? state.policy : null;
  const asyncPickerProps = {
    variant: "menu" as const,
    minQueryLength: 1,
    searchDebounceMs: 250,
    showLabel: true,
  };
  return (
    <ConfirmDialog
      open={state !== null}
      onOpenChange={onOpenChange}
      title={policy ? "Edit Registration Policy" : "New Registration Policy"}
      description="Policy changes affect hosted registration immediately. Disabled clients still cannot create accounts unless policy and OAuth checks both pass."
      confirmLabel={policy ? "Save" : "Create"}
      error={error}
      size="lg"
      onConfirm={onConfirm}
    >
      <Grid columns="two" gap="md">
        <TextInput label="Name" name="name" required defaultValue={policy?.name ?? ""} />
        <TextInput label="Slug" name="slug" required defaultValue={policy?.slug ?? ""} />
        <RadioGroup
          title="Mode"
          name="mode"
          options={modeOptions}
          defaultValue={policy?.mode ?? "client_initiated"}
          required
        />
        <ResourceSelector
          {...asyncPickerProps}
          kind="oauth-client"
          label="Client"
          name="clientId"
          placeholder="Select an OAuth client"
          value={form.clientId}
          onChange={(next) => setField("clientId", String(next))}
          source={{ mode: "async", load: loadClients }}
          initialOptions={initialClientOptions}
        />
        <ResourceSelector
          {...asyncPickerProps}
          kind="organization"
          label="Organization"
          name="organizationId"
          placeholder="Select an organization"
          value={form.organizationId}
          onChange={(next) => {
            setField("organizationId", String(next));
            setField("defaultTeamIds", []);
          }}
          source={{ mode: "async", load: loadOrganizations }}
          initialOptions={initialOrganizationOptions}
        />
        <ResourceSelector
          {...asyncPickerProps}
          kind="resource-server"
          label="Resource server"
          name="resourceServerId"
          placeholder="Select a resource server"
          value={form.resourceServerId}
          onChange={(next) => setField("resourceServerId", String(next))}
          source={{ mode: "async", load: loadResourceServers }}
          initialOptions={initialResourceServerOptions}
        />
        <ScopeBuilder
          label="Allowed scopes"
          name="allowedScopes"
          value={form.allowedScopes}
          onChange={(next) => setField("allowedScopes", next)}
          suggestions={scopeSuggestions}
          searchValue={scopeSearch}
          onSearchValueChange={onScopeSearchChange}
          variant="menu"
          allowCustom
        />
        <TagInput
          label="Email domains"
          name="emailDomains"
          value={form.emailDomains}
          onChange={(next) => setField("emailDomains", next)}
          validate={defaultDomainValidate}
          normalize={(value) => value.toLowerCase()}
          placeholder="acme.com, then Enter"
        />
        <ResourceSelector
          {...asyncPickerProps}
          kind="team"
          label="Default teams"
          selectionMode="multiple"
          name="defaultTeamIds"
          placeholder={form.organizationId ? "Add a default team" : "Select an organization first"}
          value={form.defaultTeamIds}
          onChange={(next) => setField("defaultTeamIds", Array.isArray(next) ? next : [next])}
          source={{ mode: "async", load: loadTeams }}
          initialOptions={initialTeamOptions}
        />
        <NumberInput
          label="Quota limit"
          name="quotaLimit"
          minValue={1}
          value={form.quotaLimit}
          onChange={(next) => setField("quotaLimit", next)}
          description="Maximum accounts or memberships this policy may admit. Leave empty for no cap."
        />
        <RadioGroup
          title="Quota target"
          name="quotaTarget"
          options={quotaTargetOptions}
          defaultValue={policy?.quotaTarget ?? "memberships"}
          required
        />
        <Switch
          label="Require email verification"
          selected={form.requiresEmailVerification}
          onChange={(next) => setField("requiresEmailVerification", next)}
        />
        <DateTimeInput
          label="Starts at"
          name="startsAt"
          value={form.startsAt}
          onChange={(next) => setField("startsAt", next)}
        />
        <DateTimeInput
          label="Expires at"
          name="expiresAt"
          value={form.expiresAt}
          onChange={(next) => setField("expiresAt", next)}
        />
      </Grid>
    </ConfirmDialog>
  );
}
