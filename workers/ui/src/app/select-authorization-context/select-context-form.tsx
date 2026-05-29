"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Inline, RadioGroup, Stack, Text } from "@id/ui";
import { authApiGetOrThrow, authApiPost, OAUTH_QUERY_PARAM } from "@id/lib";
import { useOauthQuery, useOauthRequestDescription } from "@/lib/oauth-query";
import { DIRECT_SHARE_VALUE, WORKSPACE_CONTEXT_PREFIX } from "@/shared/constants";

type Organization = {
  id: string;
  name: string;
};

const organizationSchema = { parse: (data: unknown): readonly Organization[] => {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is Organization =>
      typeof item === "object" && item !== null &&
      typeof (item as Record<string, unknown>).id === "string" && ((item as Record<string, unknown>).id as string).length > 0 &&
      typeof (item as Record<string, unknown>).name === "string" && ((item as Record<string, unknown>).name as string).length > 0,
  );
} };

async function fetchOrganizations(): Promise<readonly Organization[]> {
  try {
    const data = await authApiGetOrThrow<unknown>("/organization/list");
    return organizationSchema.parse(data);
  } catch {
    return [];
  }
}

export function SelectContextForm() {
  const router = useRouter();
  const oauthQuery = useOauthQuery();
  const description = useOauthRequestDescription(oauthQuery);
  const [organizations, setOrganizations] = useState<readonly Organization[]>([]);
  const [selection, setSelection] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchOrganizations().then((orgs) => {
      setOrganizations(orgs);
      setSelection(orgs.length > 0 ? `${WORKSPACE_CONTEXT_PREFIX}${orgs[0].id}` : DIRECT_SHARE_VALUE);
      return undefined;
    });
  }, []);

  const handleContinue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = await authApiPost<Record<string, unknown>>(
        "/oauth2/continue",
        { postLogin: true, [OAUTH_QUERY_PARAM]: oauthQuery },
        { headers: { "x-id-oauth-context": selection } },
      );

      const redirectUrl = body.redirect_uri || body.url || body.redirectURL;
      if (redirectUrl) {
        router.push(redirectUrl as string);
        return;
      }
      setError((body.message || body.error || "Selection failed") as string);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const workspaceOptions = useMemo(
    () =>
      organizations.map((org) => ({
        value: `${WORKSPACE_CONTEXT_PREFIX}${org.id}`,
        label: org.name,
      })),
    [organizations],
  );

  const individualOptions = useMemo(
    () => [{ value: DIRECT_SHARE_VALUE, label: "Direct share — individual collaborator" }],
    [],
  );

  return (
    <Stack>
      <Form onSubmit={handleContinue}>
        <Stack>
          <Text variant="body">{description}</Text>

          {organizations.length > 0 ? (
            <RadioGroup title="Workspace access" name="context-workspace" options={workspaceOptions} value={selection} onChange={setSelection} />
          ) : (
            <Text variant="caption">No organizations available.</Text>
          )}

          <RadioGroup title="Individual access" name="context-individual" options={individualOptions} value={selection} onChange={setSelection} />

          {error && <Alert tone="error">{error}</Alert>}

          <Inline justify="end">
            <Button type="submit" variant="primary" disabled={loading || !selection}>
              {loading ? "Processing..." : "Continue"}
            </Button>
          </Inline>
        </Stack>
      </Form>
    </Stack>
  );
}
