import { redirect } from "next/navigation";

export default function PlatformIdentityRegistrationPoliciesRedirect({
  searchParams,
}: {
  readonly searchParams?: Record<string, string | string[] | undefined>;
}) {
  redirect(`/admin/platform/access/registration-policies${queryString(searchParams)}`);
}

function queryString(searchParams: Record<string, string | string[] | undefined> | undefined): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    } else if (value !== undefined) {
      next.set(key, value);
    }
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}
