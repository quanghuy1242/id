"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScopeCatalogContent } from "../../_components/oauth/scope-catalog-content";

export default function ScopeCatalogPage() {
  return (
    <Suspense fallback={<ScopeCatalogContent loading />}>
      <ScopeCatalogPageContent />
    </Suspense>
  );
}

function ScopeCatalogPageContent() {
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
    router.push(next.toString() ? `/admin/oauth/scope-catalog?${next.toString()}` : "/admin/oauth/scope-catalog");
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
