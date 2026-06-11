"use client";

import { type FormEvent, useState } from "react";
import useSWR from "swr";
import {
  Badge,
  Button,
  Checkbox,
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

type AccountSecurityContentProps = {
  readonly actions?: Pick<AccountActions, "getAccountSummary" | "changePassword" | "sendVerificationEmail">;
  readonly loading?: boolean;
  readonly error?: string;
};

function passwordError(value: string): string | undefined {
  if (!value) return "Password is required";
  if (value.length < 12) return "Password must be at least 12 characters";
  return undefined;
}

export function AccountSecurityContent({
  actions = defaultAccountActions,
  loading,
  error: errorOverride,
}: AccountSecurityContentProps) {
  const skipFetch = loading || errorOverride;
  const { data, isLoading, error, mutate } = useSWR(skipFetch ? null : accountSummaryKey(), () => actions.getAccountSummary());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const showLoading = loading ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const nextErrors: Record<string, string> = {};
    if (!values.currentPassword) nextErrors.currentPassword = "Current password is required";
    const nextPasswordError = passwordError(values.newPassword ?? "");
    if (nextPasswordError) nextErrors.newPassword = nextPasswordError;
    if (values.newPassword !== values.confirmPassword) nextErrors.confirmPassword = "Passwords do not match";
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setChanging(true);
    try {
      await actions.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: values.revokeOtherSessions === "on",
      });
      form.reset();
      toast.success("Password changed");
    } catch (err: unknown) {
      toast.error("Password change failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setChanging(false);
    }
  }

  async function handleSendVerification() {
    if (!data) return;
    setSendingVerification(true);
    try {
      await actions.sendVerificationEmail(data.user.email);
      toast.success("Verification email sent", "Check your inbox for the latest link.");
    } catch (err: unknown) {
      toast.error("Verification email failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSendingVerification(false);
    }
  }

  if (showLoading) {
    return (
      <Stack>
        <PageIntro title="Security" description="Change your password, review verification, and manage sign-in security." />
        <Panel><Skeleton rows={8} /></Panel>
      </Stack>
    );
  }

  if (showError || !data) {
    return (
      <Stack>
        <PageIntro title="Security" description="Change your password, review verification, and manage sign-in security." />
        <ErrorAlert message={showError ?? "Security settings are unavailable."} onRetry={() => void mutate()} />
      </Stack>
    );
  }

  return (
    <Stack>
      <PageIntro title="Security" description="Change your password, review verification, and manage sign-in security." />
      <Panel>
        <Stack>
          <Text variant="h2">Password</Text>
          <Form onSubmit={handleChangePassword} validationErrors={validationErrors}>
            <Stack>
              <TextInput label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
              <TextInput label="New password" name="newPassword" type="password" autoComplete="new-password" required validate={passwordError} />
              <TextInput label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required />
              <Checkbox label="Sign out other devices" name="revokeOtherSessions" defaultSelected />
              <Inline justify="end">
                <Button type="submit" disabled={changing}>{changing ? "Changing..." : "Change password"}</Button>
              </Inline>
            </Stack>
          </Form>
        </Stack>
      </Panel>
      <Panel>
        <Stack>
          <Inline justify="between">
            <Stack gap="xs">
              <Text variant="h2">Email verification</Text>
              <Text variant="caption">{data.user.email}</Text>
            </Stack>
            {data.user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge>}
          </Inline>
          {data.user.emailVerified ? null : (
            <Inline justify="end">
              <Button variant="secondary" onClick={handleSendVerification} disabled={sendingVerification}>
                {sendingVerification ? "Sending..." : "Send verification email"}
              </Button>
            </Inline>
          )}
        </Stack>
      </Panel>
      <Panel>
        <DescriptionList
          items={[
            { term: "Multi-factor authentication", description: <Badge tone="neutral">Coming later</Badge> },
            { term: "Session review", description: "Open Sessions to revoke browsers you no longer use." },
          ]}
        />
      </Panel>
    </Stack>
  );
}

