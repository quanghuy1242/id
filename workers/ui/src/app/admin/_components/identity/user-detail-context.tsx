"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  getUser as getUserAction,
  getCurrentSession as getCurrentSessionAction,
  type CurrentSession,
  type User,
} from "../../_actions/users";
import { userDetailKey, currentSessionKey, isUsersListKey } from "@/app/admin/_data/swr-keys";

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
  const { mutate: globalMutate } = useSWRConfig();
  const skip = Boolean(loadingOverride || errorOverride) || !userId;

  const { data: userData, isLoading: userLoading, error: userError, mutate: mutateUser } = useSWR(
    skip ? null : userDetailKey(userId),
    () => actions.getUser(userId),
  );
  const { data: sessionData, mutate: mutateSession } = useSWR(
    skip ? null : currentSessionKey(),
    () => actions.getCurrentSession(),
  );

  // Local cache patch from a mutation response; also invalidates the users-list
  // cache so the list reflects the change on next visit (no eager refetch).
  const setUser = useCallback(
    (u: User) => {
      void mutateUser({ user: u }, { revalidate: false });
      void globalMutate(isUsersListKey, undefined, { revalidate: false });
    },
    [mutateUser, globalMutate],
  );

  const setCurrentSession = useCallback(
    (s: CurrentSession) => {
      void mutateSession(s, { revalidate: false });
    },
    [mutateSession],
  );

  const refetch = useCallback(() => {
    void mutateUser();
    void mutateSession();
  }, [mutateUser, mutateSession]);

  const isLoading = loadingOverride ?? (errorOverride ? false : !userId || userLoading);
  const error = errorOverride ?? (userError instanceof Error ? userError.message : userError ? String(userError) : undefined);

  return (
    <UserDetailContext.Provider
      value={{
        userId,
        user: userData?.user ?? null,
        setUser,
        currentSession: sessionData ?? null,
        setCurrentSession,
        isLoading,
        error,
        refetch,
      }}
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
