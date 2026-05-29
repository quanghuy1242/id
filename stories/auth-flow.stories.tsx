import type { Story, StoryDefault } from "@ladle/react";
import ConsentPage from "../workers/ui/src/app/consent/page";
import LoginPage from "../workers/ui/src/app/login/page";
import SelectAuthorizationContextPage from "../workers/ui/src/app/select-authorization-context/page";
import { setMockPathname } from "../.ladle/mocks/next-navigation";

const OAUTH_QUERY = "client_id=acme-web&scope=openid%20profile%20email%20org%3Aread&redirect_uri=%2Fcallback&state=demo-state";

function setMockUrl(pathname: string, search = "") {
  setMockPathname(pathname);
  if (typeof window === "undefined") return;
  const suffix = search ? `?${search}` : "";
  window.history.replaceState({}, "", `${pathname}${suffix}`);
}

function installAdminOtpFetchMock() {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (url.startsWith("/api/auth/sign-in/email")) {
      return new Response(
        JSON.stringify({ code: "admin_otp_required", maskedEmail: "a***@e***.com" }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return originalFetch(input, init);
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
  title: "Auth Flow",
} satisfies StoryDefault;

export const Login: Story = () => {
  setMockUrl("/login", OAUTH_QUERY);
  return <LoginPage />;
};

export const AdminLoginOtpChallenge: Story = () => {
  setMockUrl("/login", "");
  installAdminOtpFetchMock();
  return <LoginPage />;
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
