"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Heading, Page, PageBody, PageHeader, Panel, Stack, Text, TextInput, HiddenInput } from "@id/ui";
import { OAUTH_QUERY_PARAM, postAuthApi } from "@id/lib";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;

    try {
      const body = await postAuthApi("/sign-in/email", {
        email: data.email,
        password: data.password,
        [OAUTH_QUERY_PARAM]: data[OAUTH_QUERY_PARAM],
      });

      if (body.redirect) {
        router.push((body.url || body.redirectURL || "/") as string);
        return;
      }
      if (body.url) {
        router.push(body.url as string);
        return;
      }
      setError((body.message || body.error || "Sign in failed") as string);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <PageHeader>
        <Heading level="h1">Sign in</Heading>
      </PageHeader>
      <PageBody>
        <Panel>
          <Stack>
            {error && <Text level="caption">{error}</Text>}
            <form onSubmit={handleSubmit}>
              <Stack>
                <HiddenInput name={OAUTH_QUERY_PARAM} value={getOauthQuery()} />
                <TextInput label="Email" name="email" type="email" autoComplete="username" required />
                <TextInput label="Password" name="password" type="password" autoComplete="current-password" required />
                <Button type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </Stack>
            </form>
          </Stack>
        </Panel>
      </PageBody>
    </Page>
  );
}

function getOauthQuery(): string {
  if (typeof window !== "undefined") {
    return new URL(window.location.href).searchParams.toString();
  }
  return "";
}
