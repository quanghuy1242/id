"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getUser as getUserAction,
  getCurrentSession as getCurrentSessionAction,
  type CurrentSession,
  type User,
} from "../../_actions/users";

const defaultFetchActions = {
  getUser: getUserAction,
  getCurrentSession: getCurrentSessionAction,
};

export type UserDetailContextValue = {
  userId: string;
  user: User | null;
  setUser: (u: User) => void;
  currentSession: CurrentSession;
  setCurrentSession: (s: CurrentSession) => void;
  isLoading: boolean;
  error: string | undefined;
  refetch: () => void;
};

const UserDetailContext = createContext<UserDetailContextValue | null>(null);

type UserDetailProviderProps = {
  userId: string;
  loading?: boolean;
  error?: string;
  actions?: typeof defaultFetchActions;
  children: ReactNode;
};

export function UserDetailProvider({
  userId,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultFetchActions,
  children,
}: UserDetailProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [currentSession, setCurrentSession] = useState<CurrentSession>(null);
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (loadingOverride || errorOverride || !userId) return;
    setIsLoading(true);
    setFetchError(undefined);
    setUser(null);
    let cancelled = false;
    void (async () => {
      try {
        const [{ user: fetched }, session] = await Promise.all([
          actions.getUser(userId),
          actions.getCurrentSession(),
        ]);
        if (!cancelled) {
          setUser(fetched);
          setCurrentSession(session);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load user");
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [actions, userId, loadingOverride, errorOverride, fetchKey]);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  return (
    <UserDetailContext.Provider
      value={{ userId, user, setUser, currentSession, setCurrentSession, isLoading: showLoading, error: showError, refetch }}
    >
      {children}
    </UserDetailContext.Provider>
  );
}

export function useUserDetail(): UserDetailContextValue {
  const ctx = useContext(UserDetailContext);
  if (!ctx) throw new Error("useUserDetail must be used within UserDetailProvider");
  return ctx;
}
