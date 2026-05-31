"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Alert, LinkButton, Skeleton, Stack, Text } from "@id/ui";
import { verifyEmail } from "../account/_actions/account";

export function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { data, isLoading } = useSWR(token ? ["/verify-email", token] : null, () => verifyEmail(token));

  if (!token) {
    return (
      <Stack>
        <Alert tone="error">This verification link is missing a token.</Alert>
        <LinkButton href="/account/security" variant="secondary">Open security settings</LinkButton>
      </Stack>
    );
  }

  if (isLoading) {
    return <Skeleton rows={3} />;
  }

  if (data?.error) {
    return (
      <Stack>
        <Alert tone="error">{data.message ?? "Verification link is invalid or expired."}</Alert>
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

