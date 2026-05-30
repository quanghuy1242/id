"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PageBody, Stack, Tabs } from "@id/ui";

type SecurityLayoutProps = {
  readonly children: ReactNode;
};

const sectionTabs = [
  { id: "sessions", href: "/admin/security/sessions", label: "Sessions" },
  { id: "tokens-access", href: "/admin/security/tokens?type=access", label: "Access Tokens" },
  { id: "tokens-refresh", href: "/admin/security/tokens?type=refresh", label: "Refresh Tokens" },
  { id: "consents", href: "/admin/security/consents", label: "Consents" },
  { id: "jwks", href: "/admin/security/jwks", label: "Signing Keys" },
  { id: "introspect", href: "/admin/security/introspect", label: "Token Decoder" },
];

/**
 * Section-level route tabs for the unified grants surface (docs/027 §6): sessions,
 * access/refresh tokens, and consents are facets of one concept, with JWKS as a
 * sibling. Tabs are URL-addressable; the two token tabs share `/security/tokens`
 * and are distinguished by the `type` query param. Detail routes (e.g.
 * `jwks/[kid]`) render their own tabs, so the section bar hides there.
 */
function SecurityTabs() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  let selectedKey: string | undefined;
  if (pathname.startsWith("/admin/security/sessions")) selectedKey = "sessions";
  else if (pathname.startsWith("/admin/security/tokens")) selectedKey = searchParams.get("type") === "refresh" ? "tokens-refresh" : "tokens-access";
  else if (pathname.startsWith("/admin/security/consents")) selectedKey = "consents";
  else if (pathname === "/admin/security/jwks") selectedKey = "jwks";
  else if (pathname.startsWith("/admin/security/introspect")) selectedKey = "introspect";

  if (!selectedKey) return null;
  return <Tabs ariaLabel="Security section navigation" items={sectionTabs} selectedKey={selectedKey} />;
}

export default function SecurityLayout({ children }: SecurityLayoutProps) {
  return (
    <PageBody>
      <Stack gap="md">
        <Suspense fallback={null}>
          <SecurityTabs />
        </Suspense>
        {children}
      </Stack>
    </PageBody>
  );
}
