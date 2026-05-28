"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@id/ui";
import { UsersListContent } from "../../_components/identity/users-list-content";

export default function UsersPage() {
  return (
    <PageBody>
      <Suspense fallback={<UsersListContent loading />}>
        <UsersPageContent />
      </Suspense>
    </PageBody>
  );
}

function UsersPageContent() {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <UsersListContent
      searchValue={params.get("q") ?? undefined}
      roleFilter={params.get("role") ?? undefined}
      statusFilter={params.get("status") ?? undefined}
      sortBy={params.get("sortBy") ?? undefined}
      sortDirection={(params.get("sortDir") as "asc" | "desc") ?? undefined}
      page={params.get("page") ? Number(params.get("page")) : undefined}
      onSearchChange={(v) =>
        router.push(`/admin/identity/users?${buildParams(params, { q: v, page: null })}`)
      }
      onRoleFilterChange={(v) =>
        router.push(`/admin/identity/users?${buildParams(params, { role: v === "all" ? null : v, page: null })}`)
      }
      onStatusFilterChange={(v) =>
        router.push(`/admin/identity/users?${buildParams(params, { status: v === "all" ? null : v, page: null })}`)
      }
      onSort={(key, dir) =>
        router.push(`/admin/identity/users?${buildParams(params, { sortBy: key, sortDir: dir, page: null })}`)
      }
      onPageChange={(page) =>
        router.push(`/admin/identity/users?${buildParams(params, { page: String(page) })}`)
      }
      onRowClick={(id) => router.push(`/admin/identity/users/${id}`)}
    />
  );
}

function buildParams(
  current: ReturnType<typeof useSearchParams>,
  overrides: Record<string, string | null>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next.toString();
}
