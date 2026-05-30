"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  PageIntro,
  Panel,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  Textarea,
  toast,
} from "@id/ui";
import {
  listAdminJwks as listAdminJwksAction,
  rotateAdminJwks as rotateAdminJwksAction,
  type AdminJwk,
} from "../../_actions/audit";
import { adminJwksKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listJwks: listAdminJwksAction,
  rotateJwks: rotateAdminJwksAction,
};

const statusBadge: Record<AdminJwk["status"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  active: { tone: "success", label: "Active" },
  rotated: { tone: "warning", label: "Rotated" },
  expired: { tone: "neutral", label: "Expired" },
};

function formatDate(ms: number | null): string {
  return ms === null ? "Never" : new Date(ms).toLocaleString();
}

type JwksContentProps = {
  loading?: boolean;
  error?: string;
  onKeyClick?: (kid: string) => void;
  actions?: typeof defaultActions;
};

export function JwksContent({
  loading: loadingOverride,
  error: errorOverride,
  onKeyClick,
  actions = defaultActions,
}: JwksContentProps) {
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateError, setRotateError] = useState<string | undefined>();

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

  const columns: DataTableColumn<AdminJwk>[] = [
    { key: "id", label: "Key ID", sortable: true },
    { key: "alg", label: "Alg" },
    {
      key: "status",
      label: "Status",
      render: (key) => {
        const badge = statusBadge[key.status];
        return <Badge tone={badge.tone}>{badge.label}</Badge>;
      },
    },
    { key: "createdAt", label: "Created", sortable: true, render: (key) => formatDate(key.createdAt) },
    { key: "expiresAt", label: "Expires", render: (key) => formatDate(key.expiresAt) },
  ];

  async function handleRotate(formData: FormData) {
    setRotateError(undefined);
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 3) {
      setRotateError("Reason is required");
      return false;
    }
    try {
      await actions.rotateJwks(reason);
      await mutate();
      toast.success("Signing key rotated", "A new public key is now available in JWKS.");
      return true;
    } catch (err: unknown) {
      setRotateError(err instanceof Error ? err.message : "Failed to rotate signing key");
      return false;
    }
  }

  function renderBody() {
    if (showLoading) return <Skeleton rows={6} height="md" />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (list.length === 0) return <Panel><EmptyState message="No JWKS keys available" /></Panel>;
    return (
      <>
        <StatGroup columns={4}>
          <Stat title="Total" value={list.length} description="signing keys" tone="primary" />
          <Stat title="Active" value={counts.active} description="signs new tokens" tone="success" />
          <Stat title="Rotated" value={counts.rotated} description="in grace" tone="warning" />
          <Stat title="Expired" value={counts.expired} description="audit only" />
        </StatGroup>
        <Panel padding="none">
          <DataTable<AdminJwk>
            columns={columns}
            rows={ordered}
            getRowKey={(key) => key.id}
            onRowClick={onKeyClick ? (key) => onKeyClick(key.id) : undefined}
          />
        </Panel>
      </>
    );
  }

  return (
    <Stack gap="md">
      <PageIntro
        title="Signing Keys"
        description="The public keys that verify tokens this provider issues, published at the JWKS endpoint."
        info="These are the public halves of the keys used to sign ID tokens and JWT access tokens. Relying parties fetch them from the JWKS endpoint to verify signatures. Active keys sign new tokens; rotated keys still verify older tokens until they expire; expired keys are retained only for audit. Private keys are never shown."
        actions={
          <Button variant="secondary" iconName="RefreshCw" onClick={() => setRotateOpen(true)}>
            Emergency Rotate
          </Button>
        }
      />
      {renderBody()}
      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={(open) => { setRotateOpen(open); if (!open) setRotateError(undefined); }}
        title="Emergency rotate signing keys"
        description="Create and promote a new signing key. Existing keys remain published through their grace window so currently issued tokens can still verify."
        confirmLabel="Rotate key"
        variant="danger"
        error={rotateError}
        onConfirm={handleRotate}
      >
        <Textarea label="Reason" name="reason" required rows={3} placeholder="Compromise response, key exposure drill, or operator request" />
      </ConfirmDialog>
    </Stack>
  );
}
