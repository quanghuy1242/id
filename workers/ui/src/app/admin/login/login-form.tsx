"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, HiddenInput, Stack, Text, TextInput } from "@id/ui";
import { OAUTH_QUERY_PARAM, postAuthApi } from "@id/lib";
import { useOauthQuery } from "@/lib/oauth-query";

export function LoginForm() {
  const router = useRouter();
  const oauthQuery = useOauthQuery();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = event.currentTarget;
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
    <Stack>
      {error && <Text variant="caption">{error}</Text>}
      <form onSubmit={handleSubmit}>
        <Stack>
          <HiddenInput name={OAUTH_QUERY_PARAM} value={oauthQuery} />
          <TextInput label="Email" name="email" type="email" autoComplete="username" required />
          <TextInput label="Password" name="password" type="password" autoComplete="current-password" required />
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
