"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Heading, Inline, Page, PageBody, PageHeader, Panel, Stack, Text } from "@id/ui";
import { OAUTH_QUERY_PARAM, postAuthApi } from "@id/lib";

export default function ConsentPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConsent = async (accept: boolean) => {
    setError("");
    setLoading(true);

    try {
      const oauthQuery = getOauthQuery();
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
    <Page>
      <PageHeader>
        <Heading level="h1">Authorize application</Heading>
      </PageHeader>
      <PageBody>
        <Panel>
          <Stack>
            <Text>{getClientDescription()}</Text>
            {error && <Text level="caption">{error}</Text>}
            <Inline>
              <Button variant="primary" disabled={loading} onClick={() => handleConsent(true)}>
                Allow
              </Button>
              <Button variant="secondary" disabled={loading} onClick={() => handleConsent(false)}>
                Deny
              </Button>
            </Inline>
          </Stack>
        </Panel>
      </PageBody>
    </Page>
  );
}

function getOauthQuery(): string {
  if (typeof window !== "undefined") {
    return new URL(window.location.href).searchParams.toString();
  }
  return "";
}

function getClientDescription(): string {
  if (typeof window !== "undefined") {
    const search = new URL(window.location.href).searchParams;
    const name = search.get("client_name") ?? search.get("client_id") ?? "this application";
    const scope = search.get("scope") ?? "";
    return `${name} is requesting access.${scope ? ` Scopes: ${scope}` : ""}`;
  }
  return "An application is requesting access.";
}
