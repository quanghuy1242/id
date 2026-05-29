"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { Alert, Button, Form, HiddenInput, Inline, Stack, TextInput } from "@id/ui";
import { OAUTH_QUERY_PARAM, postAuthApi } from "@id/lib";
import { useOauthQuery } from "@/lib/oauth-query";

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

function validationErrorsFor(data: Record<string, string>): Record<string, string> {
  const emailErr = validateEmail(data.email);
  const passwordErr = validatePassword(data.password);
  return {
    ...(emailErr ? { email: emailErr } : {}),
    ...(passwordErr ? { password: passwordErr } : {}),
  };
}

function loginPayload(data: Record<string, string>): Record<string, string> {
  const oauthQuery = data[OAUTH_QUERY_PARAM];
  const payload: Record<string, string> = {
    email: data.email,
    password: data.password,
    [OAUTH_QUERY_PARAM]: oauthQuery,
  };
  // Admin logins default to /admin so the handler returns a redirect (and the
  // server guard sees a valid context). OAuth flows never carry a callbackURL.
  const callbackURL = oauthQuery ? currentAdminCallbackURL() : (currentAdminCallbackURL() || "/admin");
  if (callbackURL) payload.callbackURL = callbackURL;
  if (data.otp) payload.otp = data.otp;
  return payload;
}

type LoginResult = {
  redirectUrl?: string;
  error?: string;
  errorCode?: string;
  maskedEmail?: string;
};

type PendingCredentials = {
  readonly email: string;
  readonly password: string;
  readonly oauthQuery: string;
};

type PendingChallenge = {
  readonly email: string;
};

async function submitLogin(data: Record<string, string>): Promise<LoginResult> {
  const body = await postAuthApi("/sign-in/email", loginPayload(data));
  const redirectUrl = body.redirect
    ? (body.url || body.redirectURL || "/") as string
    : body.url as string | undefined;

  if (redirectUrl) {
    return isSameOrigin(redirectUrl)
      ? { redirectUrl }
      : { error: "Unexpected redirect target" };
  }

  return {
    error: (body.message || body.error || "Sign in failed") as string,
    errorCode: body.code as string | undefined,
    maskedEmail: body.maskedEmail as string | undefined,
  };
}

function validateOtp(value: string): string | undefined {
  return /^\d{6}$/.test(value) ? undefined : "Enter the 6-digit code";
}

function otpValidationErrorsFor(data: Record<string, string>): Record<string, string> {
  const otpErr = validateOtp(data.otp ?? "");
  return otpErr ? { otp: otpErr } : {};
}

export function LoginForm() {
  const router = useRouter();
  const oauthQuery = useOauthQuery();
  const pendingCredentials = useRef<PendingCredentials | null>(null);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);
  const [emailDefault, setEmailDefault] = useState("");
  const submitLabel = pendingChallenge ? "Verify and sign in" : "Sign in";
  const loadingLabel = pendingChallenge ? "Verifying..." : "Signing in...";

  const handleUseDifferentEmail = () => {
    const email = pendingCredentials.current?.email ?? pendingChallenge?.email ?? "";
    pendingCredentials.current = null;
    setPendingChallenge(null);
    setEmailDefault(email);
    setError("");
    setNotice("");
    setValidationErrors({});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setValidationErrors({});

    const form = event.currentTarget;
    const formData = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const activePendingCredentials = pendingCredentials.current;
    const data = activePendingCredentials
      ? {
          email: activePendingCredentials.email,
          password: activePendingCredentials.password,
          [OAUTH_QUERY_PARAM]: activePendingCredentials.oauthQuery,
          otp: formData.otp ?? "",
        }
      : formData;
    const nextValidationErrors = activePendingCredentials
      ? otpValidationErrorsFor(data)
      : validationErrorsFor(data);
    if (Object.keys(nextValidationErrors).length > 0) {
      setValidationErrors(nextValidationErrors);
      return;
    }

    setLoading(true);

    try {
      const result = await submitLogin(data);
      if (result.redirectUrl) { router.push(result.redirectUrl); return; }
      if (result.errorCode === "admin_otp_required") {
        pendingCredentials.current = {
          email: data.email,
          password: data.password,
          oauthQuery: data[OAUTH_QUERY_PARAM] ?? "",
        };
        setPendingChallenge({ email: data.email });
        setNotice(
          result.maskedEmail
            ? `We sent a verification code to ${result.maskedEmail}. Enter it below to continue.`
            : "We sent a verification code to your email. Enter it below to continue.",
        );
        return;
      }
      setError(result.error ?? "Sign in failed");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}
      <Form onSubmit={handleSubmit} validationErrors={validationErrors}>
        <Stack>
          <HiddenInput name={OAUTH_QUERY_PARAM} value={oauthQuery} />
          {pendingChallenge ? (
            <div className="rounded-box border border-base-300 bg-base-200 px-4 py-3">
              <Inline justify="between">
                <div>
                  <div className="text-xs font-medium uppercase text-base-content/60">Email</div>
                  <div className="text-sm font-medium text-base-content">{pendingChallenge.email}</div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loading}
                  onClick={handleUseDifferentEmail}
                >
                  Use a different email
                </Button>
              </Inline>
            </div>
          ) : (
            <>
              <TextInput
                label="Email"
                name="email"
                type="email"
                autoComplete="username"
                required
                defaultValue={emailDefault}
                validate={validateEmail}
              />
              <TextInput
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                validate={validatePassword}
              />
            </>
          )}
          {pendingChallenge && (
            <TextInput
              label="Verification code"
              name="otp"
              type="text"
              autoComplete="one-time-code"
              required
              validate={validateOtp}
            />
          )}
          <Inline justify="end">
            <Button type="submit" disabled={loading}>
              {loading ? loadingLabel : submitLabel}
            </Button>
          </Inline>
        </Stack>
      </Form>
    </Stack>
  );
}
