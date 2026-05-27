"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Badge, Button, Inline, Stack, Text } from "@id/ui";
import { OAUTH_QUERY_PARAM, postAuthApi } from "@id/lib";
import { useOauthQuery } from "@/lib/oauth-query";

type ClientInfo = {
  name: string;
  scopes: readonly string[];
};

function parseClientInfo(oauthQuery: string): ClientInfo {
  if (!oauthQuery) return { name: "an application", scopes: [] };
  const search = new URLSearchParams(oauthQuery);
  return {
    name: `Client ${search.get("client_id") ?? "unknown"}`,
    scopes: (search.get("scope") ?? "").split(" ").filter(Boolean),
  };
}

export function ConsentForm() {
  const router = useRouter();
  const oauthQuery = useOauthQuery();
  const clientInfo = useMemo(() => parseClientInfo(oauthQuery), [oauthQuery]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConsent = async (accept: boolean) => {
    setError("");
    setLoading(true);

    try {
      const body = await postAuthApi("/oauth2/consent", {
        accept,
        [OAUTH_QUERY_PARAM]: oauthQuery,
      });

      const redirectUrl = body.redirect_uri || body.url || body.redirectURL;
      if (redirectUrl) {
        router.push(redirectUrl as string);
        return;
      }
      setError((body.message || body.error || "Consent failed") as string);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack>
      <Text variant="body">
        <strong>{clientInfo.name}</strong> is requesting permission to access your account.
      </Text>

      {clientInfo.scopes.length > 0 && (
        <Stack gap="xs">
          <Text variant="caption">Requested access:</Text>
          <Inline gap="xs">
            {clientInfo.scopes.map((scope) => (
              <Badge key={scope} tone="neutral">
                {scope}
              </Badge>
            ))}
          </Inline>
        </Stack>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <Inline justify="end">
        <Button variant="secondary" disabled={loading} onClick={() => handleConsent(false)}>
          Deny
        </Button>
        <Button variant="primary" disabled={loading} onClick={() => handleConsent(true)}>
          Allow
        </Button>
      </Inline>
    </Stack>
  );
}
