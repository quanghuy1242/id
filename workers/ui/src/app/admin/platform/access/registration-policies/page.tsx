"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@idco/ui";
import { RegistrationPoliciesContent } from "../../../_components/access/registration-policies-content";
import { buildRouteParams } from "../../../_data/route-params";

const routePath = "/admin/platform/access/registration-policies";

export default function PlatformRegistrationPoliciesPage() {
  return (
    <PageBody>
      <Suspense fallback={<RegistrationPoliciesContent loading />}>
        <PlatformRegistrationPoliciesPageContent />
      </Suspense>
    </PageBody>
  );
}

function PlatformRegistrationPoliciesPageContent() {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <RegistrationPoliciesContent
      search={params.get("q") ?? undefined}
      status={params.get("status") ?? undefined}
      sortBy={params.get("sortBy") ?? undefined}
      sortDirection={(params.get("sortDir") as "asc" | "desc") ?? undefined}
      selectedId={params.get("selected") ?? undefined}
      onSearchChange={(value) => router.push(`${routePath}?${buildRouteParams(params, { q: value || null })}`)}
      onStatusChange={(value) => router.push(`${routePath}?${buildRouteParams(params, { status: value === "all" ? null : value })}`)}
      onSort={(key, dir) => router.push(`${routePath}?${buildRouteParams(params, { sortBy: key, sortDir: dir })}`)}
      onSelectedIdChange={(id) => router.push(`${routePath}?${buildRouteParams(params, { selected: id })}`)}
    />
  );
}
