"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, Button, HiddenInput, Inline, Stack, TextInput } from "@id/ui";
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

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function safeAdminCallbackURL(value: string | null): string {
  if (typeof window === "undefined") return "";
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !isAdminPath(url.pathname)) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function currentAdminCallbackURL(): string {
  if (typeof window === "undefined") return "";
  return safeAdminCallbackURL(new URL(window.location.href).searchParams.get("callbackURL"));
}

function initialError(): string {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get("error") === "admin_required"
    ? "Admin access is required."
    : "";
}

export function LoginForm() {
  const router = useRouter();
  const oauthQuery = useOauthQuery();
  const [error, setError] = useState(initialError);
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
      const payload: Record<string, string> = {
        email: data.email,
        password: data.password,
        [OAUTH_QUERY_PARAM]: data[OAUTH_QUERY_PARAM],
      };
      const callbackURL = currentAdminCallbackURL();
      if (callbackURL) payload.callbackURL = callbackURL;

      const body = await postAuthApi("/sign-in/email", payload);

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
          <Inline justify="end">
            <Button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </Inline>
        </Stack>
      </form>
    </Stack>
  );
}
