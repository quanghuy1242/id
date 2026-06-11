"use client";

import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Form, Inline, LinkButton, Stack, TextInput } from "@idco/ui";
import { resetPassword } from "../account/_actions/account";

function passwordError(value: string): string | undefined {
  if (!value) return "Password is required";
  if (value.length < 12) return "Password must be at least 12 characters";
  return undefined;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? searchParams.get("code") ?? "";
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const nextErrors: Record<string, string> = {};
    const err = passwordError(values.newPassword ?? "");
    if (err) nextErrors.newPassword = err;
    if (values.newPassword !== values.confirmPassword) nextErrors.confirmPassword = "Passwords do not match";
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await resetPassword(values.newPassword, token);
      router.push("/login?callbackURL=/account/security");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Reset link is invalid or expired.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <Stack>
        <Alert tone="error">This reset link is missing a token.</Alert>
        <Inline justify="end">
          <LinkButton href="/forgot-password" variant="secondary">Request a new link</LinkButton>
        </Inline>
      </Stack>
    );
  }

  return (
    <Stack>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Form onSubmit={handleSubmit} validationErrors={validationErrors}>
        <Stack>
          <TextInput label="New password" name="newPassword" type="password" autoComplete="new-password" required validate={passwordError} />
          <TextInput label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required />
          <Inline justify="end">
            <Button type="submit" disabled={submitting}>{submitting ? "Resetting..." : "Reset password"}</Button>
          </Inline>
        </Stack>
      </Form>
    </Stack>
  );
}

