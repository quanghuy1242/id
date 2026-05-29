"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ADMIN_SWR_CONFIG } from "@/shared/swr-config";

/**
 * Client boundary that applies the site-wide SWR defaults to every admin page.
 * The admin layout is a server component, so the `<SWRConfig>` context provider
 * lives here. No custom `provider` is set — the module-level singleton cache is
 * correct for the single-admin-per-browser topology (see `docs/025` §9.6).
 */
export function AdminSwrProvider({ children }: { children: ReactNode }) {
  return <SWRConfig value={ADMIN_SWR_CONFIG}>{children}</SWRConfig>;
}
