"use client";

import {
  Badge,
  DescriptionList,
  JsonViewer,
  Panel,
  Skeleton,
  Stack,
} from "@id/ui";
import { useOrgDetail } from "./org-detail-context";

type OrgDetailOverviewContentProps = {
  readonly actions?: unknown;
};

export function OrgDetailOverviewContent(_props: OrgDetailOverviewContentProps = {}) {
  const { org, isLoading, error } = useOrgDetail();

  if (isLoading) return <Skeleton rows={4} height="md" />;
  if (error) return null;
  if (!org) return null;

  return (
    <Stack gap="md">
      <Panel>
        <Stack gap="md">
          <DescriptionList
            columns={2}
            items={[
              { term: "Name", description: org.name },
              { term: "Slug", description: <Badge tone="neutral">{org.slug}</Badge> },
              { term: "Logo URL", description: org.logo || "No logo configured", mono: Boolean(org.logo) },
              { term: "Created", description: new Date(org.createdAt).toLocaleDateString() },
            ]}
          />
          {org.metadata ? (
            <JsonViewer label="Metadata" value={org.metadata} maxHeight="sm" />
          ) : null}
        </Stack>
      </Panel>
    </Stack>
  );
}
