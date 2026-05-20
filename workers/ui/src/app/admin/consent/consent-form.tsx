"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Inline, Stack, Text } from "@id/ui";
import { OAUTH_QUERY_PARAM, postAuthApi } from "@id/lib";
import { useOauthQuery, useOauthRequestDescription } from "@/lib/oauth-query";

export function ConsentForm() {
  const router = useRouter();
  const oauthQuery = useOauthQuery();
  const clientDescription = useOauthRequestDescription(oauthQuery);
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

      if (body.redirect_uri) {
        router.push(body.redirect_uri as string);
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
      <Text>{clientDescription}</Text>
      {error && <Text variant="caption">{error}</Text>}
      <Inline>
        <Button variant="primary" disabled={loading} onClick={() => handleConsent(true)}>
          Allow
        </Button>
        <Button variant="secondary" disabled={loading} onClick={() => handleConsent(false)}>
          Deny
        </Button>
      </Inline>
    </Stack>
  );
}
