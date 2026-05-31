"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ADMIN_SWR_CONFIG } from "@/shared/swr-config";

export function AccountSwrProvider({ children }: { readonly children: ReactNode }) {
  return <SWRConfig value={ADMIN_SWR_CONFIG}>{children}</SWRConfig>;
}

