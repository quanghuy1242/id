"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getFullOrganization as getFullOrganizationAction,
  type Organization,
} from "../../_actions/organizations";

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
  const [org, setOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (loadingOverride || errorOverride || !orgId) return;
    setIsLoading(true);
    setFetchError(undefined);
    setOrg(null);
    let cancelled = false;
    void (async () => {
      try {
        const fetched = await actions.getFullOrganization(orgId);
        if (!cancelled) {
          setOrg(fetched);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load organization");
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actions, orgId, loadingOverride, errorOverride, fetchKey]);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  return (
    <OrgDetailContext.Provider
      value={{ orgId, org, setOrg, isLoading: showLoading, error: showError, refetch }}
    >
      {children}
    </OrgDetailContext.Provider>
  );
}

export function useOrgDetail(): OrgDetailContextValue {
  const ctx = useContext(OrgDetailContext);
  if (!ctx) throw new Error("useOrgDetail must be used within OrgDetailProvider");
  return ctx;
}
