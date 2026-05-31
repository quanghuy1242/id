"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@id/ui";
import { ScopeCatalogContent } from "../../../../_components/oauth/scope-catalog-content";

export default function OrgAccessScopeCatalogPage() {
  return (
    <PageBody>
      <Suspense fallback={<ScopeCatalogContent loading />}>
        <OrgAccessScopeCatalogPageContent />
      </Suspense>
    </PageBody>
  );
}

function OrgAccessScopeCatalogPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = String(params.orgId ?? "");
  const routePath = `/admin/orgs/${orgId}/access/scope-catalog`;
  const search = searchParams.get("q") ?? "";
  const sortBy = searchParams.get("sortBy") ?? "scope";
  const sortDirection = searchParams.get("sortDir") === "desc" ? "desc" : "asc";

  function updateUrl(nextValues: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(nextValues)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(next.toString() ? `${routePath}?${next.toString()}` : routePath);
  }

  return (
    <ScopeCatalogContent
      scope={{ kind: "organization", organizationId: orgId }}
      search={search}
      onSearchChange={(next) => updateUrl({ q: next || undefined })}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSort={(key, dir) => updateUrl({ sortBy: key, sortDir: dir })}
    />
  );
}
