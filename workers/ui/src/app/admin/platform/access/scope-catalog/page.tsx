"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@idco/ui";
import { ScopeCatalogContent } from "../../../_components/oauth/scope-catalog-content";

const routePath = "/admin/platform/access/scope-catalog";

export default function PlatformAccessScopeCatalogPage() {
  return (
    <PageBody>
      <Suspense fallback={<ScopeCatalogContent loading />}>
        <PlatformAccessScopeCatalogPageContent />
      </Suspense>
    </PageBody>
  );
}

function PlatformAccessScopeCatalogPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      search={search}
      onSearchChange={(next) => updateUrl({ q: next || undefined })}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSort={(key, dir) => updateUrl({ sortBy: key, sortDir: dir })}
    />
  );
}
