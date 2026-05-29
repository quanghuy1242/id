"use client";

import useSWR from "swr";
import {
  Badge,
  Button,
  CodeBlock,
  EmptyState,
  ErrorAlert,
  Grid,
  Inline,
  PageIntro,
  Panel,
  Skeleton,
  Stack,
  Text,
  toast,
} from "@id/ui";
import { listAdminJwks as listAdminJwksAction, type AdminJwk } from "../../_actions/audit";
import { adminJwksKey } from "@/app/admin/_data/swr-keys";
import { copyToClipboard } from "@/shared/clipboard";

const defaultActions = {
  listJwks: listAdminJwksAction,
};

const statusBadge: Record<AdminJwk["status"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  active: { tone: "success", label: "Active" },
  rotated: { tone: "warning", label: "Rotated" },
  expired: { tone: "neutral", label: "Expired" },
};

function formatDate(ms: number | null): string {
  return ms === null ? "Never" : new Date(ms).toLocaleString();
}

function copyJwk(jwk: string, keyId: string): void {
  void (async () => {
    const ok = await copyToClipboard(jwk);
    if (ok) toast.success("JWK copied", `Public key ${keyId} is on your clipboard.`);
    else toast.error("Couldn't copy", "Select the JWK and copy it manually.");
  })();
}

type JwksContentProps = {
  loading?: boolean;
  error?: string;
  actions?: typeof defaultActions;
};

export function JwksContent({
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: JwksContentProps) {
  const { data: keys, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : adminJwksKey(),
    () => actions.listJwks(),
  );

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const list = keys ?? [];

  const counts = list.reduce(
    (acc, k) => { acc[k.status] += 1; return acc; },
    { active: 0, rotated: 0, expired: 0 } as Record<AdminJwk["status"], number>,
  );
  const ordered = [...list].sort((a, b) => {
    const statusOrder: Record<AdminJwk["status"], number> = { active: 0, rotated: 1, expired: 2 };
    return statusOrder[a.status] - statusOrder[b.status] || (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });

  function renderBody() {
    if (showLoading) return <Skeleton rows={6} height="md" />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (list.length === 0) return <EmptyState message="No JWKS keys available" />;
    return (
      <>
        <Panel>
          <Inline gap="sm" wrap align="center">
            <Badge tone="info" size="sm">Public JWKS</Badge>
            <Badge tone="success" size="sm">{counts.active} active</Badge>
            <Badge tone="warning" size="sm">{counts.rotated} rotated</Badge>
            <Badge tone="neutral" size="sm">{counts.expired} expired</Badge>
          </Inline>
        </Panel>

        {ordered.map((key) => {
          const badge = statusBadge[key.status];
          const jwk = JSON.stringify(key.publicJwk, null, 2);
          return (
            <Panel key={key.id} tone={key.status === "expired" ? "muted" : "base"}>
              <Stack gap="sm">
                <Inline justify="between" align="center">
                  <Text variant="h3" mono>{key.id}</Text>
                  <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                </Inline>
                <Grid columns="three">
                  <Stack gap="xs">
                    <Text variant="caption">Algorithm</Text>
                    <Text variant="body">{key.alg}</Text>
                  </Stack>
                  <Stack gap="xs">
                    <Text variant="caption">Created</Text>
                    <Text variant="body">{formatDate(key.createdAt)}</Text>
                  </Stack>
                  <Stack gap="xs">
                    <Text variant="caption">Expires</Text>
                    <Text variant="body">{formatDate(key.expiresAt)}</Text>
                  </Stack>
                </Grid>
                <CodeBlock
                  label="Public JWK"
                  value={jwk}
                  maxHeight="lg"
                  action={
                    <Button size="sm" variant="secondary" iconName="Copy" tooltip="Copy public JWK" onClick={() => copyJwk(jwk, key.id)}>
                      Copy
                    </Button>
                  }
                />
              </Stack>
            </Panel>
          );
        })}

        <Text variant="caption">
          Total: {list.length} {list.length === 1 ? "key" : "keys"} ({counts.active} active, {counts.rotated} rotated, {counts.expired} expired)
        </Text>
      </>
    );
  }

  return (
    <Stack gap="md">
      <PageIntro
        title="Signing Keys"
        description="The public keys that verify tokens this provider issues, published at the JWKS endpoint."
        info="These are the public halves of the keys used to sign ID tokens and JWT access tokens. Relying parties fetch them from the JWKS endpoint to verify signatures. Active keys sign new tokens; rotated keys still verify older tokens until they expire; expired keys are retained only for audit. Private keys are never shown."
      />
      {renderBody()}
    </Stack>
  );
}
