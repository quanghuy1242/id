"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  getFullOrganization as getFullOrganizationAction,
  type Organization,
} from "../../_actions/organizations";
import { orgDetailKey, isOrgsListKey } from "@/app/admin/_data/swr-keys";

const defaultFetchActions = {
  getFullOrganization: getFullOrganizationAction,
};

export type OrgDetailContextValue = {
  orgId: string;
  org: Organization | null;
  setOrg: (org: Organization) => void;
  isLoading: boolean;
  error: string | undefined;
  refetch: () => void;
};

const OrgDetailContext = createContext<OrgDetailContextValue | null>(null);

type OrgDetailProviderProps = {
  orgId: string;
  loading?: boolean;
  error?: string;
  actions?: typeof defaultFetchActions;
  children: ReactNode;
};

export function OrgDetailProvider({
  orgId,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultFetchActions,
  children,
}: OrgDetailProviderProps) {
  const { mutate: globalMutate } = useSWRConfig();
  const skip = Boolean(loadingOverride || errorOverride) || !orgId;

  const { data: org, isLoading: orgLoading, error: orgError, mutate: mutateOrg } = useSWR(
    skip ? null : orgDetailKey(orgId),
    () => actions.getFullOrganization(orgId),
  );

  const setOrg = useCallback(
    (next: Organization) => {
      void mutateOrg(next, { revalidate: false });
      void globalMutate(isOrgsListKey, undefined, { revalidate: false });
    },
    [mutateOrg, globalMutate],
  );

  const refetch = useCallback(() => {
    void mutateOrg();
  }, [mutateOrg]);

  const isLoading = loadingOverride ?? (errorOverride ? false : !orgId || orgLoading);
  const error = errorOverride ?? (orgError instanceof Error ? orgError.message : orgError ? String(orgError) : undefined);

  return (
    <OrgDetailContext.Provider value={{ orgId, org: org ?? null, setOrg, isLoading, error, refetch }}>
      {children}
    </OrgDetailContext.Provider>
  );
}

export function useOrgDetail(): OrgDetailContextValue {
  const ctx = useContext(OrgDetailContext);
  if (!ctx) throw new Error("useOrgDetail must be used within OrgDetailProvider");
  return ctx;
}
