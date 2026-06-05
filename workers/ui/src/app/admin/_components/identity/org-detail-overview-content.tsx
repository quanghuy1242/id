"use client";

import { useMemo } from "react";
import useSWR from "swr";
import {
  Badge,
  DescriptionList,
  Grid,
  JsonViewer,
  LinkButton,
  Panel,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  StatSummaryGroup,
  Text,
} from "@id/ui";
import { listAdminConsents, listActivityLog } from "../../_actions/audit";
import {
  clientType,
  listBindings,
  listClients,
  listResourceServers,
  listScopes,
} from "../../_actions/oauth";
import {
  listInvitations,
  listMembers,
  listTeams,
} from "../../_actions/organizations";
import {
  activityLogKey,
  adminConsentsKey,
  m2mBindingsKey,
  oauthClientsKey,
  oauthScopesKey,
  orgInvitationsKey,
  orgMembersKey,
  orgTeamsKey,
  resourceServersKey,
} from "../../_data/swr-keys";
import { useOrgDetail } from "./org-detail-context";

const overviewPage = { limit: 1, offset: 0 };

const defaultOverviewActions = {
  listMembers,
  listTeams,
  listInvitations,
  listClients,
  listResourceServers,
  listScopes,
  listBindings,
  listAdminConsents,
  listActivityLog,
};

type OrgDetailOverviewContentProps = {
  readonly actions?: Partial<typeof defaultOverviewActions>;
};

function statValue(value: number | undefined): string {
  return value === undefined ? "..." : String(value);
}

function pendingInvitations(
  invitations: Awaited<ReturnType<typeof listInvitations>> | undefined,
): number | undefined {
  return invitations?.filter((invitation) => invitation.status === "pending")
    .length;
}

export function OrgDetailOverviewContent({ actions }: OrgDetailOverviewContentProps = {}) {
  const { org, isLoading, error } = useOrgDetail();
  const resolvedActions = { ...defaultOverviewActions, ...actions };
  const orgId = org?.id;
  const scope = useMemo(
    () =>
      orgId
        ? ({ kind: "organization" as const, organizationId: orgId })
        : undefined,
    [orgId],
  );
  const consentParams = useMemo(
    () =>
      orgId
        ? { ...overviewPage, organizationId: orgId }
        : undefined,
    [orgId],
  );
  const activityParams = useMemo(
    () =>
      orgId
        ? { ...overviewPage, organizationId: orgId }
        : undefined,
    [orgId],
  );

  const { data: members } = useSWR(
    orgId ? orgMembersKey(orgId) : null,
    () => (orgId ? resolvedActions.listMembers(orgId) : Promise.resolve([])),
  );
  const { data: teams } = useSWR(
    orgId ? orgTeamsKey(orgId) : null,
    () => (orgId ? resolvedActions.listTeams(orgId) : Promise.resolve([])),
  );
  const { data: invitations } = useSWR(
    orgId ? orgInvitationsKey(orgId) : null,
    () => (orgId ? resolvedActions.listInvitations(orgId) : Promise.resolve([])),
  );
  const { data: clients } = useSWR(
    scope ? oauthClientsKey(scope) : null,
    () => (scope ? resolvedActions.listClients(scope) : Promise.resolve([])),
  );
  const { data: resourceServers } = useSWR(
    scope ? resourceServersKey(scope) : null,
    () => (scope ? resolvedActions.listResourceServers(scope) : Promise.resolve([])),
  );
  const { data: scopes } = useSWR(
    scope ? oauthScopesKey(scope) : null,
    () => (scope ? resolvedActions.listScopes(scope) : Promise.resolve([])),
  );
  const { data: bindings } = useSWR(
    scope ? m2mBindingsKey(scope) : null,
    () => (scope ? resolvedActions.listBindings(scope) : Promise.resolve([])),
  );
  const { data: consents } = useSWR(
    consentParams ? adminConsentsKey(consentParams) : null,
    () =>
      consentParams
        ? resolvedActions.listAdminConsents(consentParams)
        : Promise.resolve({ consents: [], total: 0, ...overviewPage }),
  );
  const { data: activity } = useSWR(
    activityParams ? activityLogKey(activityParams) : null,
    () =>
      activityParams
        ? resolvedActions.listActivityLog(activityParams)
        : Promise.resolve({ entries: [], total: 0, ...overviewPage }),
  );

  if (isLoading) return <Skeleton rows={4} height="md" />;
  if (error) return null;
  if (!org) return null;

  const m2mClients = clients?.filter((client) => clientType(client) === "M2M");
  const enabledResourceServers = resourceServers?.filter((server) => server.enabled);
  const enabledScopes = scopes?.filter((scopeRow) => scopeRow.enabled);
  const enabledBindings = bindings?.filter((binding) => binding.enabled);

  return (
    <Stack gap="md">
      <StatSummaryGroup>
        <StatGroup columns={4} density="compact" frame="seamless">
          <Stat title="Members" value={statValue(members?.length)} description={`${statValue(pendingInvitations(invitations))} pending invites`} tone="primary" />
          <Stat title="Teams" value={statValue(teams?.length)} description="collaboration groups" />
          <Stat title="Applications" value={statValue(clients?.length)} description={`${statValue(m2mClients?.length)} service accounts`} tone="info" />
          <Stat title="Resource APIs" value={statValue(resourceServers?.length)} description={`${statValue(enabledResourceServers?.length)} enabled`} />
        </StatGroup>
        <StatGroup columns={4} density="compact" frame="seamless">
          <Stat title="Scopes" value={statValue(scopes?.length)} description={`${statValue(enabledScopes?.length)} enabled`} />
          <Stat title="M2M Bindings" value={statValue(bindings?.length)} description={`${statValue(enabledBindings?.length)} enabled`} />
          <Stat title="Consents" value={statValue(consents?.total)} description="org-owned client grants" />
          <Stat title="Audit Events" value={statValue(activity?.total)} description="organization timeline" />
        </StatGroup>
      </StatSummaryGroup>
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
      <Grid columns="three" gap="md">
        {[
          {
            href: `/admin/orgs/${org.id}/identity/members`,
            title: "Members",
            body: "Review organization members, roles, teams, and invitations.",
          },
          {
            href: `/admin/orgs/${org.id}/oauth/applications`,
            title: "Applications",
            body: "Manage client-facing OAuth apps owned by this organization.",
          },
          {
            href: `/admin/orgs/${org.id}/access/service-accounts`,
            title: "Service Accounts",
            body: "Create and rotate tenant M2M clients bound to this organization.",
          },
          {
            href: `/admin/orgs/${org.id}/access/resource-apis`,
            title: "Resource APIs",
            body: "Manage organization-owned audiences and API metadata.",
          },
          {
            href: `/admin/orgs/${org.id}/security/consents`,
            title: "Consents",
            body: "Review grants for users who authorized org-owned applications.",
          },
          {
            href: `/admin/orgs/${org.id}/audit`,
            title: "Audit",
            body: "Inspect activity recorded for this organization scope.",
          },
        ].map((section) => (
          <Panel key={section.href}>
            <Stack gap="md" justify="between" fill>
              <Stack gap="sm">
                <Text variant="h3">{section.title}</Text>
                <Text variant="caption">{section.body}</Text>
              </Stack>
              <LinkButton href={section.href} variant="secondary" size="sm">Open</LinkButton>
            </Stack>
          </Panel>
        ))}
      </Grid>
    </Stack>
  );
}
