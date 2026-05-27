"use client";

import { useEffect, useMemo, useState } from "react";

export function useOauthQuery(): string {
  const [oauthQuery, setOauthQuery] = useState("");

  useEffect(() => {
    setOauthQuery(new URL(window.location.href).searchParams.toString());
  }, []);

  return oauthQuery;
}

export function useOauthRequestDescription(oauthQuery: string): string {
  return useMemo(() => {
    if (!oauthQuery) {
      return "An application is requesting access.";
    }

    const search = new URLSearchParams(oauthQuery);
    const clientId = search.get("client_id") ?? "this application";
    const scope = search.get("scope") ?? "";
    return `Client ${clientId} is requesting access.${scope ? ` Scopes: ${scope}` : ""}`;
  }, [oauthQuery]);
}
