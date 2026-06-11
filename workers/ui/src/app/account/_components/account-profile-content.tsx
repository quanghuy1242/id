"use client";

import { type FormEvent, useState } from "react";
import useSWR from "swr";
import {
  Badge,
  Button,
  DescriptionList,
  ErrorAlert,
  Form,
  Inline,
  PageIntro,
  Panel,
  Skeleton,
  Stack,
  Text,
  TextInput,
  toast,
} from "@idco/ui";
import { accountSummaryKey } from "../_data/swr-keys";
import { defaultAccountActions, type AccountActions } from "../_actions/account";

type AccountProfileContentProps = {
  readonly actions?: Pick<AccountActions, "getAccountSummary" | "updateProfile">;
  readonly loading?: boolean;
  readonly error?: string;
};

function validateName(value: string): string | undefined {
  if (!value.trim()) return "Display name is required";
  if (value.trim().length > 80) return "Display name must be 80 characters or less";
  return undefined;
}

function validateImage(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "Avatar URL must use https";
  } catch {
    return "Enter a valid URL";
  }
  return undefined;
}

export function AccountProfileContent({
  actions = defaultAccountActions,
  loading,
  error: errorOverride,
}: AccountProfileContentProps) {
  const skipFetch = loading || errorOverride;
  const { data, isLoading, error, mutate } = useSWR(skipFetch ? null : accountSummaryKey(), () => actions.getAccountSummary());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const showLoading = loading ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const formData = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const errors = {
      ...(validateName(formData.name ?? "") ? { name: validateName(formData.name ?? "")! } : {}),
      ...(validateImage(formData.image ?? "") ? { image: validateImage(formData.image ?? "")! } : {}),
    };
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await actions.updateProfile({ name: formData.name.trim(), image: formData.image?.trim() || null });
      await mutate();
      toast.success("Profile updated");
    } catch (err: unknown) {
      toast.error("Profile update failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (showLoading) {
    return (
      <Stack>
        <PageIntro title="Profile" description="Manage the shared identity claims shown to connected applications." />
        <Panel><Skeleton rows={6} /></Panel>
      </Stack>
    );
  }

  if (showError || !data) {
    return (
      <Stack>
        <PageIntro title="Profile" description="Manage the shared identity claims shown to connected applications." />
        <ErrorAlert message={showError ?? "Profile is unavailable."} onRetry={() => void mutate()} />
      </Stack>
    );
  }

  return (
    <Stack>
      <PageIntro title="Profile" description="Manage the shared identity claims shown to connected applications." />
      <Panel>
        <Stack>
          <DescriptionList
            items={[
              { term: "User ID", description: data.user.id, mono: true },
              { term: "Email", description: data.user.email },
              { term: "Verification", description: data.user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge> },
            ]}
          />
          <Form onSubmit={handleSubmit} validationErrors={validationErrors}>
            <Stack>
              <TextInput label="Display name" name="name" required defaultValue={data.user.name ?? ""} validate={validateName} />
              <TextInput label="Avatar URL" name="image" defaultValue={data.user.image ?? ""} validate={validateImage} />
              <Inline justify="between">
                <Text variant="caption">Email changes are not available in this release.</Text>
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
              </Inline>
            </Stack>
          </Form>
        </Stack>
      </Panel>
    </Stack>
  );
}

