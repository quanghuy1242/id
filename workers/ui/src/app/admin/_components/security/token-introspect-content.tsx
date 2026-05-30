"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  CodeEditor,
  DescriptionList,
  ErrorAlert,
  FilterDropdown,
  Form,
  Inline,
  JsonViewer,
  PageIntro,
  Panel,
  Stack,
  Stat,
  StatGroup,
  Text,
  TextInput,
} from "@id/ui";
import {
  introspectToken as introspectTokenAction,
  type TokenIntrospectionResult,
} from "../../_actions/audit";

const defaultActions = {
  introspectToken: introspectTokenAction,
};

type TokenHint = "access_token" | "refresh_token";

type DecodedJwt = {
  readonly header: Record<string, unknown> | null;
  readonly claims: Record<string, unknown> | null;
  readonly error?: string;
};

type TokenIntrospectContentProps = {
  readonly actions?: typeof defaultActions;
};

const tokenHintOptions = [
  { value: "access_token", label: "Access token" },
  { value: "refresh_token", label: "Refresh token" },
];

function formatEpochSeconds(value: unknown): string {
  if (typeof value !== "number") return "Unknown";
  return new Date(value * 1000).toLocaleString();
}

function decodeJsonPart(value: string): Record<string, unknown> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(globalThis.atob(padded)) as Record<string, unknown>;
}

function decodeJwt(token: string): DecodedJwt {
  if (!token) return { header: null, claims: null };
  const parts = token.split(".");
  if (parts.length < 2) return { header: null, claims: null, error: "This token is not a JWT. Introspection can still validate opaque tokens." };
  try {
    return {
      header: decodeJsonPart(parts[0] ?? ""),
      claims: decodeJsonPart(parts[1] ?? ""),
    };
  } catch {
    return { header: null, claims: null, error: "Unable to decode JWT header or claims." };
  }
}

function claimText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" || typeof value === "number" ? String(value) : "Unknown";
}

type TokenIntrospectFormProps = {
  readonly token: string;
  readonly tokenHint: TokenHint;
  readonly submitting: boolean;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onTokenChange: (value: string) => void;
  readonly onTokenHintChange: (value: TokenHint) => void;
  readonly onClientIdChange: (value: string) => void;
  readonly onClientSecretChange: (value: string) => void;
  readonly onResourceChange: (value: string) => void;
};

function TokenIntrospectForm({
  token,
  tokenHint,
  submitting,
  onSubmit,
  onTokenChange,
  onTokenHintChange,
  onClientIdChange,
  onClientSecretChange,
  onResourceChange,
}: TokenIntrospectFormProps) {
  return (
    <Panel>
      <Form onSubmit={onSubmit}>
        <Stack gap="md">
          <CodeEditor label="Token" value={token} onChange={onTokenChange} />
          <Inline gap="sm" align="end">
            <FilterDropdown label="Token type hint" options={tokenHintOptions} value={tokenHint} onChange={(next) => onTokenHintChange(next as TokenHint)} showLabel />
            <TextInput label="Client ID" name="client_id" onChange={onClientIdChange} />
            <TextInput label="Client Secret" name="client_secret" type="password" onChange={onClientSecretChange} />
            <TextInput label="Resource" name="resource" onChange={onResourceChange} />
          </Inline>
          <Inline>
            <Button type="submit" disabled={submitting} iconName="Fingerprint">
              {submitting ? "Introspecting..." : "Introspect"}
            </Button>
          </Inline>
        </Stack>
      </Form>
    </Panel>
  );
}

function DecodedTokenPanels({ decoded, isJwt, token }: { readonly decoded: DecodedJwt; readonly isJwt: boolean; readonly token: string }) {
  return (
    <>
      <StatGroup columns={3}>
        <Stat title="Format" value={isJwt ? "JWT" : token.trim() ? "Opaque" : "Waiting"} tone={isJwt ? "success" : "neutral"} />
        <Stat title="Signing kid" value={claimText(decoded.header?.kid)} description="From JWT header" />
        <Stat title="Audience" value={claimText(decoded.claims?.aud)} description="From JWT claims" />
      </StatGroup>
      {decoded.error ? <Text variant="caption">{decoded.error}</Text> : null}
      {isJwt ? (
        <Stack gap="md">
          <JsonViewer label="Decoded Header" value={decoded.header ?? {}} />
          <JsonViewer label="Decoded Claims" value={decoded.claims ?? {}} />
        </Stack>
      ) : null}
    </>
  );
}

function IntrospectionResultPanel({ result }: { readonly result: TokenIntrospectionResult }) {
  return (
    <Panel>
      <Stack gap="md">
        <DescriptionList
          columns={2}
          items={[
            { term: "Status", description: result.active ? <Badge tone="success">Active</Badge> : <Badge tone="error">Inactive</Badge> },
            { term: "Client ID", description: result.client_id ?? "Unknown", mono: Boolean(result.client_id) },
            { term: "Token type", description: result.token_type ?? "Unknown" },
            { term: "Scopes", description: result.scope ?? "None", mono: Boolean(result.scope) },
            { term: "Expires", description: formatEpochSeconds(result.exp) },
            { term: "Username", description: result.username ?? "Unknown" },
          ]}
        />
        <JsonViewer label="Introspection Response" value={result} />
      </Stack>
    </Panel>
  );
}

export function TokenIntrospectContent({ actions = defaultActions }: TokenIntrospectContentProps) {
  const [token, setToken] = useState("");
  const [tokenHint, setTokenHint] = useState<TokenHint>("access_token");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [resource, setResource] = useState("");
  const [result, setResult] = useState<TokenIntrospectionResult | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const decoded = useMemo(() => decodeJwt(token.trim()), [token]);
  const isJwt = decoded.header !== null && decoded.claims !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setResult(null);
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError("Paste a token to introspect.");
      return;
    }
    setSubmitting(true);
    try {
      const next = await actions.introspectToken({
        token: trimmedToken,
        token_type_hint: tokenHint,
        client_id: clientId.trim() || undefined,
        client_secret: clientSecret.trim() || undefined,
        resource: resource.trim() || undefined,
      });
      setResult(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Token introspection failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="md">
      <PageIntro
        title="Token Decoder"
        description="Decode JWT header and claims locally, then call the RFC 7662 token introspection endpoint when validation is needed."
        info="JWT decoding is local and does not prove that a token is active. Introspection calls the OAuth2 token introspection endpoint and may require the client credentials for the token being checked."
      />
      <TokenIntrospectForm
        token={token}
        tokenHint={tokenHint}
        submitting={submitting}
        onSubmit={(event) => void handleSubmit(event)}
        onTokenChange={setToken}
        onTokenHintChange={setTokenHint}
        onClientIdChange={setClientId}
        onClientSecretChange={setClientSecret}
        onResourceChange={setResource}
      />
      {error ? <ErrorAlert message={error} /> : null}
      <DecodedTokenPanels decoded={decoded} isJwt={isJwt} token={token} />
      {result ? <IntrospectionResultPanel result={result} /> : null}
    </Stack>
  );
}
