"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@idco/ui";
import { RegistrationPoliciesContent } from "../../../../_components/identity/registration-policies-content";

export default function OrgRegistrationPoliciesPage() {
  const params = useParams<{ orgId: string }>();
  return (
    <PageBody>
      <Suspense fallback={<RegistrationPoliciesContent scope={{ kind: "organization", organizationId: params.orgId }} loading />}>
        <OrgRegistrationPoliciesPageContent orgId={params.orgId} />
      </Suspense>
    </PageBody>
  );
}

function OrgRegistrationPoliciesPageContent({ orgId }: { readonly orgId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const routePath = `/admin/orgs/${orgId}/identity/registration-policies`;
  const scope = { kind: "organization" as const, organizationId: orgId };

  return (
    <RegistrationPoliciesContent
      scope={scope}
      search={params.get("q") ?? undefined}
      status={params.get("status") ?? undefined}
      sortBy={params.get("sortBy") ?? undefined}
      sortDirection={(params.get("sortDir") as "asc" | "desc") ?? undefined}
      selectedId={params.get("selected") ?? undefined}
      onSearchChange={(value) => router.push(`${routePath}?${buildParams(params, { q: value || null })}`)}
      onStatusChange={(value) => router.push(`${routePath}?${buildParams(params, { status: value === "all" ? null : value })}`)}
      onSort={(key, dir) => router.push(`${routePath}?${buildParams(params, { sortBy: key, sortDir: dir })}`)}
      onSelectedIdChange={(id) => router.push(`${routePath}?${buildParams(params, { selected: id })}`)}
    />
  );
}

function buildParams(current: ReturnType<typeof useSearchParams>, overrides: Record<string, string | null>): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next.toString();
}
