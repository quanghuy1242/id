"use client";

import { useSearchParams } from "next/navigation";
import { Alert, LinkButton, Stack, Text } from "@id/ui";

export function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  // Better Auth's GET /api/auth/verify-email is the verification endpoint: it
  // consumes the token server-side and 302-redirects here. On failure it appends
  // an `error` query param; on success it redirects with no `error`. This page is
  // only a result surface — it must not attempt to re-verify a token.
  const hasError = searchParams.has("error");

  if (hasError) {
    return (
      <Stack>
        <Alert tone="error">This verification link is invalid or has expired. Request a new one from your security settings.</Alert>
        <LinkButton href="/account/security" variant="secondary">Open security settings</LinkButton>
      </Stack>
    );
  }

  return (
    <Stack>
      <Alert tone="success">Email verified.</Alert>
      <Text variant="caption">You can return to your account security settings.</Text>
      <LinkButton href="/account/security" variant="secondary">Open security settings</LinkButton>
    </Stack>
  );
}
