"use client";

import useSWR from "swr";
import {
  Badge,
  DescriptionList,
  ErrorAlert,
  Grid,
  Inline,
  LinkButton,
  PageIntro,
  Panel,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  Text,
} from "@idco/ui";
import { accountOrganizationsKey, accountSummaryKey } from "../_data/swr-keys";
import { defaultAccountActions, type AccountActions } from "../_actions/account";
import { roleLabel, roleTone } from "./account-format";

type AccountOverviewContentProps = {
  readonly actions?: Pick<AccountActions, "getAccountSummary" | "listAccountOrganizations">;
  readonly loading?: boolean;
  readonly error?: string;
};

export function AccountOverviewContent({
  actions = defaultAccountActions,
  loading,
  error: errorOverride,
}: AccountOverviewContentProps) {
  const skipFetch = loading || errorOverride;
  const summary = useSWR(skipFetch ? null : accountSummaryKey(), () => actions.getAccountSummary());
  const organizations = useSWR(skipFetch ? null : accountOrganizationsKey(), () => actions.listAccountOrganizations());
  const showLoading = loading ?? summary.isLoading;
  const showError = errorOverride ?? (summary.error instanceof Error ? summary.error.message : summary.error ? String(summary.error) : undefined);

  if (showLoading) {
    return (
      <Stack>
        <PageIntro title="Account" description="Your profile, security state, sessions, connected applications, and organizations." />
        <Panel><Skeleton rows={6} /></Panel>
      </Stack>
    );
  }

  if (showError || !summary.data) {
    return (
      <Stack>
        <PageIntro title="Account" description="Your profile, security state, sessions, connected applications, and organizations." />
        <ErrorAlert message={showError ?? "Account summary is unavailable."} onRetry={() => void summary.mutate()} />
      </Stack>
    );
  }

  const topOrganizations = (organizations.data?.organizations ?? []).slice(0, 3);

  return (
    <Stack>
      <PageIntro title="Account" description="Your profile, security state, sessions, connected applications, and organizations." />
      <StatGroup columns={3}>
        <Stat title="Organizations" value={summary.data.counts.organizations} description="memberships and console scopes" tone="primary" iconName="Building2" />
        <Stat title="Sessions" value={summary.data.counts.activeSessions} description="active browser sessions" tone="info" iconName="Clock" />
        <Stat title="Connected apps" value={summary.data.counts.connectedApplications} description="authorized OAuth clients" tone="success" iconName="AppWindow" />
      </StatGroup>
      <Grid columns="two">
        <Panel>
          <Stack>
            <Inline justify="between" align="center">
              <Text variant="h2">Profile</Text>
              <LinkButton href="/account/profile" variant="secondary" iconName="Pencil">Edit</LinkButton>
            </Inline>
            <DescriptionList
              columns={1}
              items={[
                { term: "Name", description: summary.data.user.name ?? "Not set" },
                { term: "Email", description: summary.data.user.email },
                { term: "Verification", description: summary.data.user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge> },
              ]}
            />
          </Stack>
        </Panel>
        <Panel>
          <Stack>
            <Inline justify="between" align="center">
              <Text variant="h2">Security</Text>
              <LinkButton href="/account/security" variant="secondary" iconName="ShieldCheck">Manage</LinkButton>
            </Inline>
            <DescriptionList
              columns={1}
              items={[
                { term: "Password", description: summary.data.security.passwordEnabled ? "Enabled" : "Not enabled" },
                { term: "Email verification", description: summary.data.security.emailVerificationRequired ? "Required" : "Optional" },
                { term: "Multi-factor", description: <Badge tone="neutral">Coming later</Badge> },
              ]}
            />
          </Stack>
        </Panel>
      </Grid>
      <Panel>
        <Stack>
          <Inline justify="between" align="center">
            <Text variant="h2">Organizations</Text>
            <LinkButton href="/account/organizations" variant="secondary" iconName="Building2">View all</LinkButton>
          </Inline>
          {topOrganizations.length === 0 ? (
            <Text variant="caption">No organization memberships.</Text>
          ) : (
            <Stack gap="sm">
              {topOrganizations.map((organization) => (
                <Inline key={organization.id} justify="between" align="center">
                  <Stack gap="xs">
                    <Text>{organization.name}</Text>
                    <Text variant="caption">{organization.teams.length > 0 ? `Teams: ${organization.teams.map((team) => team.name).join(", ")}` : organization.slug ? `#${organization.slug}` : organization.id}</Text>
                  </Stack>
                  <Badge tone={roleTone(organization.role)}>{roleLabel(organization.role)}</Badge>
                </Inline>
              ))}
            </Stack>
          )}
        </Stack>
      </Panel>
    </Stack>
  );
}

