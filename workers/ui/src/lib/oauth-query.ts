"use client";

import { useEffect, useMemo, useState } from "react";

const localLoginParams = new Set(["callbackURL", "error"]);

function oauthQueryFromHref(href: string): string {
  const params = new URL(href).searchParams;
  for (const key of localLoginParams) {
    params.delete(key);
  }
  return params.toString();
}

export function useOauthQuery(): string {
  const [oauthQuery, setOauthQuery] = useState("");

  useEffect(() => {
    setOauthQuery(oauthQueryFromHref(window.location.href));
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
