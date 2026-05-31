import type { ReactNode } from "react";
import { PageBody, Stack, Tabs } from "@id/ui";
import { AdminShell } from "./shell";

type SecurityShellProps = {
  readonly activePath: string;
  readonly children: ReactNode;
};

export function SecurityShell({ activePath, children }: SecurityShellProps) {
  const selectedKey = activePath.startsWith("/admin/platform/security/sessions")
    ? "sessions"
    : activePath.startsWith("/admin/platform/security/tokens")
      ? activePath.includes("type=refresh") ? "tokens-refresh" : "tokens-access"
      : activePath.startsWith("/admin/platform/security/consents")
        ? "consents"
        : activePath === "/admin/platform/security/jwks"
          ? "jwks"
          : activePath.startsWith("/admin/platform/security/introspect")
            ? "introspect"
            : undefined;

  return (
    <AdminShell activePath={activePath}>
      <PageBody>
        <Stack gap="md">
          {selectedKey ? (
            <Tabs
              ariaLabel="Security section navigation"
              selectedKey={selectedKey}
              items={[
                { id: "sessions", href: "/admin/platform/security/sessions", label: "Sessions" },
                { id: "tokens-access", href: "/admin/platform/security/tokens?type=access", label: "Access Tokens" },
                { id: "tokens-refresh", href: "/admin/platform/security/tokens?type=refresh", label: "Refresh Tokens" },
                { id: "consents", href: "/admin/platform/security/consents", label: "Consents" },
                { id: "jwks", href: "/admin/platform/security/jwks", label: "Signing Keys" },
                { id: "introspect", href: "/admin/platform/security/introspect", label: "Token Decoder" },
              ]}
            />
          ) : null}
          {children}
        </Stack>
      </PageBody>
    </AdminShell>
  );
}
