"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Form, Inline, Stack, Text, TextInput } from "@idco/ui";
import { authApiPost, authApiPostOrThrow, OAUTH_QUERY_PARAM } from "@idco/lib";
import { useOauthQuery } from "@/lib/oauth-query";

type RegistrationDecision =
  | {
      readonly decision: "allowed";
      readonly intentId: string;
      readonly client: { readonly clientId: string; readonly clientName: string } | null;
      readonly organization: { readonly id: string; readonly name: string } | null;
      readonly invitation: { readonly id: string; readonly email: string; readonly role: string | null } | null;
      readonly requestedScopes: readonly string[];
      readonly allowedScopes: readonly string[];
      readonly expiresAt: number;
      readonly continueOAuth: boolean;
    }
  | {
      readonly decision: "denied";
      readonly reason: string;
      readonly message: string;
    };

type SignupResponse = {
  readonly url?: string;
  readonly redirect?: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly error?: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validationErrorsFor(data: Record<string, string>): Record<string, string> {
  return {
    ...(!data.name?.trim() ? { name: "Name is required" } : {}),
    ...(!emailRegex.test(data.email ?? "") ? { email: "Enter a valid email address" } : {}),
    ...(!data.password ? { password: "Password is required" } : {}),
  };
}

function assignOAuthRedirect(url: string): void {
  const target = new URL(url, window.location.origin);
  window.location.assign(target.href);
}

type RegisterFormProps = {
  readonly invitationId?: string;
};

export function RegisterForm({ invitationId }: RegisterFormProps = {}) {
  const router = useRouter();
  const oauthQuery = useOauthQuery();
  const [decision, setDecision] = useState<RegistrationDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const scopesWereNarrowed = useMemo(() => {
    if (decision?.decision !== "allowed") return false;
    return decision.requestedScopes.some((scope) => !decision.allowedScopes.includes(scope));
  }, [decision]);

  useEffect(() => {
    if (!oauthQuery && !invitationId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await authApiPostOrThrow<RegistrationDecision>(
          "/registration/evaluate",
          {
            ...(oauthQuery ? { oauthQuery } : {}),
            ...(invitationId ? { invitationId } : {}),
          },
        );
        if (!cancelled) setDecision(result);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Registration is unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invitationId, oauthQuery]);

  useEffect(() => {
    if (oauthQuery || invitationId) return;
    setLoading(false);
    setDecision({ decision: "denied", reason: "missing_oauth_query", message: "Registration requires an application request." });
  }, [invitationId, oauthQuery]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (decision?.decision !== "allowed") return;
    setError("");
    setNotice("");
    setValidationErrors({});

    const formData = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const nextValidationErrors = validationErrorsFor(formData);
    if (Object.keys(nextValidationErrors).length > 0) {
      setValidationErrors(nextValidationErrors);
      return;
    }

    setSubmitting(true);
    try {
      await authApiPostOrThrow("/registration/submit", {
        intentId: decision.intentId,
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });
      const signup = await authApiPost<SignupResponse>(
        "/sign-up/email",
        {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          ...(oauthQuery ? { [OAUTH_QUERY_PARAM]: oauthQuery } : {}),
        },
        { headers: { "x-id-registration-intent": decision.intentId } },
      );
      if (signup.code || signup.error || signup.message) {
        setError(signup.message || signup.error || signup.code || "Registration failed.");
        return;
      }

      if (decision.continueOAuth && oauthQuery) {
        const continued = await authApiPost<SignupResponse>("/oauth2/continue", {
          created: true,
          [OAUTH_QUERY_PARAM]: oauthQuery,
        });
        if (continued.url) {
          assignOAuthRedirect(continued.url);
          return;
        }
        if (continued.code === "UNAUTHORIZED" || continued.error === "unauthorized") {
          setNotice("Check your email to verify the account, then return to the application to continue.");
          return;
        }
        await authApiPost("/registration/continuation-failed", {
          intentId: decision.intentId,
          reason: continued.message || continued.error || continued.code || "oauth_continuation_failed",
        });
        setNotice("Account created. Sign in again from the application to continue.");
        return;
      }
      router.push("/account/organizations");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Text variant="caption">Checking registration policy...</Text>;
  }

  if (decision?.decision === "denied") {
    return (
      <Stack>
        <Alert tone="warning">Registration unavailable: {decision.message}</Alert>
        <Button variant="secondary" onClick={() => router.push("/login")}>Sign in instead</Button>
      </Stack>
    );
  }

  if (!decision || decision.decision !== "allowed") {
    return (
      <Alert tone="error">Registration unavailable: {error || "Registration is unavailable."}</Alert>
    );
  }

  return (
    <Stack>
      {error ? <Alert tone="error">Registration failed: {error}</Alert> : null}
      {notice ? <Alert tone="success">Account created: {notice}</Alert> : null}
      <Stack gap="sm">
        <Text variant="caption">
          {decision.client ? `${decision.client.clientName} is requesting account creation.` : "Create an account to accept this invitation."}
        </Text>
        {decision.organization ? <Text variant="caption">{decision.organization.name} workspace</Text> : null}
        {decision.invitation ? <Text variant="caption">Invitation for {decision.invitation.email}{decision.invitation.role ? ` as ${decision.invitation.role}` : ""}</Text> : null}
        <Inline gap="xs" wrap>
          {decision.allowedScopes.map((scope) => <Badge key={scope} tone="info">{scope}</Badge>)}
        </Inline>
        {scopesWereNarrowed ? <Text variant="caption">Some requested access was narrowed by registration policy.</Text> : null}
      </Stack>
      <Form onSubmit={handleSubmit}>
        <TextInput name="name" label="Name" autoComplete="name" error={validationErrors.name} />
        <TextInput name="email" label="Email" type="email" autoComplete="email" error={validationErrors.email} />
        <TextInput name="password" label="Password" type="password" autoComplete="new-password" error={validationErrors.password} />
        <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create account"}</Button>
      </Form>
    </Stack>
  );
}
