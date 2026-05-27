"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, Button, HiddenInput, Stack, TextInput } from "@id/ui";
import { OAUTH_QUERY_PARAM, postAuthApi } from "@id/lib";
import { useOauthQuery } from "@/lib/oauth-query";

type FieldErrors = {
  email?: string;
  password?: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Email is required";
  if (!emailRegex.test(value)) return "Enter a valid email address";
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (!value) return "Password is required";
  return undefined;
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function LoginForm() {
  const router = useRouter();
  const oauthQuery = useOauthQuery();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;

    const emailErr = validateEmail(data.email);
    const passwordErr = validatePassword(data.password);
    if (emailErr || passwordErr) {
      setFieldErrors({ email: emailErr, password: passwordErr });
      return;
    }

    setLoading(true);

    try {
      const body = await postAuthApi("/sign-in/email", {
        email: data.email,
        password: data.password,
        [OAUTH_QUERY_PARAM]: data[OAUTH_QUERY_PARAM],
      });

      if (body.redirect) {
        const url = (body.url || body.redirectURL || "/") as string;
        if (isSameOrigin(url)) { router.push(url); return; }
        setError("Unexpected redirect target");
        return;
      }
      if (body.url) {
        const url = body.url as string;
        if (isSameOrigin(url)) { router.push(url); return; }
        setError("Unexpected redirect target");
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
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={handleSubmit}>
        <Stack>
          <HiddenInput name={OAUTH_QUERY_PARAM} value={oauthQuery} />
          <TextInput
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            required
            error={fieldErrors.email}
          />
          <TextInput
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            error={fieldErrors.password}
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
