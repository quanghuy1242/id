import type { Story, StoryDefault } from "@ladle/react";
import ConsentPage from "../workers/ui/src/app/consent/page";
import ForgotPasswordPage from "../workers/ui/src/app/forgot-password/page";
import LoginPage from "../workers/ui/src/app/login/page";
import ResetPasswordPage from "../workers/ui/src/app/reset-password/page";
import SelectAuthorizationContextPage from "../workers/ui/src/app/select-authorization-context/page";
import VerifyEmailPage from "../workers/ui/src/app/verify-email/page";
import { setMockPathname } from "../.ladle/mocks/next-navigation";

const OAUTH_QUERY = "client_id=acme-web&scope=openid%20profile%20email%20org%3Aread&redirect_uri=%2Fcallback&state=demo-state";

function setMockUrl(pathname: string, search = "") {
  setMockPathname(pathname);
  if (typeof window === "undefined") return;
  const suffix = search ? `?${search}` : "";
  window.history.replaceState({}, "", `${pathname}${suffix}`);
}

function installPlatformStepUpFetchMock() {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (url.startsWith("/api/auth/admin/step-up/request")) {
      return new Response(
        JSON.stringify({ status: true, maskedEmail: "a***@e***.com" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    if (url.startsWith("/api/auth/admin/step-up/verify")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { otp?: string } : {};
      return new Response(
        JSON.stringify(
          body.otp === "123456"
            ? { steppedUp: true }
            : { code: "invalid_otp", message: "Invalid or expired code" },
        ),
        {
          status: body.otp === "123456" ? 200 : 401,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return originalFetch(input, init);
  };
}

function installAccountUtilityFetchMock() {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (url.startsWith("/api/auth/request-password-reset")) {
      return new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("/api/auth/reset-password")) {
      return new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("/api/auth/verify-email")) {
      return new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input);
  };
}

function installOrganizationFetchMock() {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (url.startsWith("/api/auth/organization/list")) {
      return new Response(
        JSON.stringify([
          { id: "org_acme", name: "Acme Corp" },
          { id: "org_beta", name: "Beta Team" },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return originalFetch(input, init);
  };
}

export default {
  title: "Hosted UI / Auth Flow",
} satisfies StoryDefault;

export const Login: Story = () => {
  setMockUrl("/login", OAUTH_QUERY);
  return <LoginPage />;
};

export const PlatformStepUp: Story = () => {
  setMockUrl("/login", "callbackURL=%2Fadmin%2Fplatform&stepUp=platform");
  installPlatformStepUpFetchMock();
  return <LoginPage />;
};

export const ForgotPassword: Story = () => {
  setMockUrl("/forgot-password");
  installAccountUtilityFetchMock();
  return <ForgotPasswordPage />;
};

export const ResetPassword: Story = () => {
  setMockUrl("/reset-password", "token=reset_story_token");
  installAccountUtilityFetchMock();
  return <ResetPasswordPage />;
};

export const VerifyEmail: Story = () => {
  setMockUrl("/verify-email", "token=verify_story_token");
  installAccountUtilityFetchMock();
  return <VerifyEmailPage />;
};

export const Consent: Story = () => {
  setMockUrl("/consent", OAUTH_QUERY);
  return <ConsentPage />;
};

export const SelectAuthorizationContext: Story = () => {
  setMockUrl("/select-authorization-context", OAUTH_QUERY);
  installOrganizationFetchMock();
  return <SelectAuthorizationContextPage />;
};
