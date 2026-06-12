"use client";

import {
  ConfirmDialog,
  DateTimeInput,
  NumberInput,
  RadioGroup,
  ResourceSelector,
  type ResourceOption,
  ScopeBuilder,
  type ScopeSuggestion,
  Stack,
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
  clientOptions,
  organizationOptions,
  resourceServerOptions,
  teamOptions,
  scopeSuggestions,
  onOpenChange,
  onConfirm,
}: {
  readonly state: PolicyDialogState | null;
  readonly form: PolicyFormState;
  readonly setField: <K extends keyof PolicyFormState>(key: K, value: PolicyFormState[K]) => void;
  readonly error?: string;
  readonly clientOptions: ResourceOption[];
  readonly organizationOptions: ResourceOption[];
  readonly resourceServerOptions: ResourceOption[];
  readonly teamOptions: ResourceOption[];
  readonly scopeSuggestions: ScopeSuggestion[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (formData: FormData) => Promise<boolean>;
}) {
  const policy = state?.mode === "edit" ? state.policy : null;
  return (
    <ConfirmDialog
      open={state !== null}
      onOpenChange={onOpenChange}
      title={policy ? "Edit Registration Policy" : "New Registration Policy"}
      description="Policy changes affect hosted registration immediately. Disabled clients still cannot create accounts unless policy and OAuth checks both pass."
      confirmLabel={policy ? "Save" : "Create"}
      error={error}
      onConfirm={onConfirm}
    >
      <Stack gap="sm">
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
          kind="oauth-client"
          label="Client"
          variant="menu"
          name="clientId"
          placeholder="Select an OAuth client"
          value={form.clientId}
          onChange={(next) => setField("clientId", String(next))}
          source={{ mode: "sync", items: clientOptions }}
          showLabel
        />
        <ResourceSelector
          kind="organization"
          label="Organization"
          variant="menu"
          name="organizationId"
          placeholder="Select an organization"
          value={form.organizationId}
          onChange={(next) => setField("organizationId", String(next))}
          source={{ mode: "sync", items: organizationOptions }}
          showLabel
        />
        <ResourceSelector
          kind="resource-server"
          label="Resource server"
          variant="menu"
          name="resourceServerId"
          placeholder="Select a resource server"
          value={form.resourceServerId}
          onChange={(next) => setField("resourceServerId", String(next))}
          source={{ mode: "sync", items: resourceServerOptions }}
          showLabel
        />
        <ScopeBuilder
          label="Allowed scopes"
          name="allowedScopes"
          value={form.allowedScopes}
          onChange={(next) => setField("allowedScopes", next)}
          suggestions={scopeSuggestions}
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
          kind="team"
          label="Default teams"
          variant="menu"
          selectionMode="multiple"
          name="defaultTeamIds"
          placeholder={form.organizationId ? "Add a default team" : "Select an organization first"}
          value={form.defaultTeamIds}
          onChange={(next) => setField("defaultTeamIds", Array.isArray(next) ? next : [next])}
          source={{ mode: "sync", items: teamOptions }}
          showLabel
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
      </Stack>
    </ConfirmDialog>
  );
}
