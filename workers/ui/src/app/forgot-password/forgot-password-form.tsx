"use client";

import { type FormEvent, useState } from "react";
import { Alert, Button, Form, Inline, LinkButton, Stack, Text, TextInput } from "@idco/ui";
import { requestPasswordReset } from "../account/_actions/account";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Email is required";
  if (!emailRegex.test(value)) return "Enter a valid email address";
  return undefined;
}

export function ForgotPasswordForm() {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const emailError = validateEmail(values.email ?? "");
    setValidationErrors(emailError ? { email: emailError } : {});
    if (emailError) return;

    setSubmitting(true);
    try {
      await requestPasswordReset(values.email.trim());
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Stack>
        <Alert tone="success">If that account exists, a reset link has been sent.</Alert>
        <Text variant="caption">Use the latest email link. Older reset links may expire.</Text>
        <Inline justify="end">
          <LinkButton href="/login?callbackURL=/account" variant="secondary">Back to sign in</LinkButton>
        </Inline>
      </Stack>
    );
  }

  return (
    <Form onSubmit={handleSubmit} validationErrors={validationErrors}>
      <Stack>
        <TextInput label="Email" name="email" type="email" autoComplete="username" required validate={validateEmail} />
        <Inline justify="between">
          <LinkButton href="/login?callbackURL=/account" variant="ghost">Back</LinkButton>
          <Button type="submit" disabled={submitting}>{submitting ? "Sending..." : "Send reset link"}</Button>
        </Inline>
      </Stack>
    </Form>
  );
}

