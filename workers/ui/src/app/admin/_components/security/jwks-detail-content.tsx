"use client";

import useSWR from "swr";
import {
  Badge,
  Button,
  DescriptionList,
  EmptyState,
  ErrorAlert,
  Inline,
  JsonViewer,
  LinkButton,
  Panel,
  Skeleton,
  Stack,
  Tabs,
  Text,
  toast,
} from "@id/ui";
import {
  listAdminJwks as listAdminJwksAction,
  type AdminJwk,
} from "../../_actions/audit";
import { ActivityLogContent } from "../activity-log-content";
import { adminJwksKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listJwks: listAdminJwksAction,
};

const statusBadge: Record<AdminJwk["status"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  active: { tone: "success", label: "Active" },
  rotated: { tone: "warning", label: "Rotated" },
  expired: { tone: "neutral", label: "Expired" },
};

export type JwksDetailTab = "overview" | "public-jwk" | "metrics" | "audit";

type JwksDetailContentProps = {
  readonly kid: string;
  readonly activeTab?: JwksDetailTab;
  readonly loading?: boolean;
  readonly error?: string;
  readonly actions?: typeof defaultActions;
};

function formatDate(ms: number | null): string {
  return ms === null ? "Never" : new Date(ms).toLocaleString();
}

function tabs(kid: string) {
  return [
    { id: "overview", href: `/admin/security/jwks/${kid}`, label: "Overview" },
    { id: "public-jwk", href: `/admin/security/jwks/${kid}/public-jwk`, label: "Public JWK" },
    { id: "metrics", href: `/admin/security/jwks/${kid}/metrics`, label: "Metrics" },
    { id: "audit", href: `/admin/security/jwks/${kid}/audit`, label: "Audit" },
  ];
}

function publicJwkJson(key: AdminJwk): string {
  return JSON.stringify(key.publicJwk, null, 2);
}

async function copyPublicJwk(key: AdminJwk) {
  try {
    await navigator.clipboard.writeText(publicJwkJson(key));
    toast.success("Public JWK copied");
  } catch {
    toast.error("Couldn't copy", "Copy the public JWK manually.");
  }
}

function downloadPublicJwk(key: AdminJwk) {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const blob = new Blob([publicJwkJson(key)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${key.id}.jwk.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Header({
  keyRecord,
  kid,
  activeTab,
}: {
  readonly keyRecord: AdminJwk | undefined;
  readonly kid: string;
  readonly activeTab: JwksDetailTab;
}) {
  const badge = keyRecord ? statusBadge[keyRecord.status] : undefined;
  return (
    <Stack gap="sm">
      <Inline justify="between">
        <Inline gap="sm">
          <LinkButton href="/admin/security/jwks" variant="secondary" size="sm" hideOnMobile iconName="ChevronLeft" ariaLabel="Back to Signing Keys" tooltip="Back to Signing Keys" />
          <Text variant="h1">{keyRecord?.id ?? kid}</Text>
          {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
        </Inline>
      </Inline>
      <Tabs ariaLabel="Signing key detail tabs" selectedKey={activeTab} items={tabs(kid)} />
    </Stack>
  );
}

function Overview({ keyRecord }: { readonly keyRecord: AdminJwk }) {
  const badge = statusBadge[keyRecord.status];
  return (
    <Panel>
      <Stack gap="md">
        <DescriptionList
          columns={2}
          items={[
            { term: "Key ID", description: keyRecord.id, mono: true },
            { term: "Algorithm", description: keyRecord.alg },
            { term: "Status", description: <Badge tone={badge.tone}>{badge.label}</Badge> },
            { term: "Created", description: formatDate(keyRecord.createdAt) },
            { term: "Expires", description: formatDate(keyRecord.expiresAt) },
          ]}
        />
        <Inline>
          <Button variant="secondary" iconName="Download" onClick={() => downloadPublicJwk(keyRecord)}>
            Download public JWK
          </Button>
        </Inline>
      </Stack>
    </Panel>
  );
}

function PublicJwk({ keyRecord }: { readonly keyRecord: AdminJwk }) {
  return (
    <JsonViewer
      label="Public JWK"
      value={keyRecord.publicJwk}
      maxHeight="lg"
      action={
        <Inline>
          <Button size="sm" variant="secondary" iconName="Copy" onClick={() => void copyPublicJwk(keyRecord)}>
            Copy
          </Button>
          <Button size="sm" variant="secondary" iconName="Download" onClick={() => downloadPublicJwk(keyRecord)}>
            Download
          </Button>
        </Inline>
      }
    />
  );
}

function renderTab(activeTab: JwksDetailTab, keyRecord: AdminJwk) {
  if (activeTab === "public-jwk") return <PublicJwk keyRecord={keyRecord} />;
  if (activeTab === "metrics") return <EmptyState message="Per-key usage metrics are not yet collected" />;
  if (activeTab === "audit") return <ActivityLogContent targetType="jwks" targetId={keyRecord.id} />;
  return <Overview keyRecord={keyRecord} />;
}

export function JwksDetailContent({
  kid,
  activeTab = "overview",
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: JwksDetailContentProps) {
  const { data: keys, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : adminJwksKey(),
    () => actions.listJwks(),
  );
  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const keyRecord = keys?.find((key) => key.id === kid);

  if (showLoading) {
    return (
      <Stack gap="md">
        <Header kid={kid} keyRecord={undefined} activeTab={activeTab} />
        <Skeleton rows={6} height="md" />
      </Stack>
    );
  }

  if (showError) {
    return (
      <Stack gap="md">
        <Header kid={kid} keyRecord={undefined} activeTab={activeTab} />
        <ErrorAlert message={showError} onRetry={() => void mutate()} />
      </Stack>
    );
  }

  if (!keyRecord) {
    return (
      <Stack gap="md">
        <Header kid={kid} keyRecord={undefined} activeTab={activeTab} />
        <ErrorAlert message="Signing key not found" onRetry={() => void mutate()} />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Header kid={kid} keyRecord={keyRecord} activeTab={activeTab} />
      {renderTab(activeTab, keyRecord)}
    </Stack>
  );
}
