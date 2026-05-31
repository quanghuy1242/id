"use client";

import useSWR from "swr";
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorAlert,
  Inline,
  LinkButton,
  PageIntro,
  Panel,
  Skeleton,
  Stack,
  Text,
  type DataTableColumn,
} from "@id/ui";
import { accountOrganizationsKey } from "../_data/swr-keys";
import { defaultAccountActions, type AccountActions, type AccountOrganization } from "../_actions/account";
import { roleLabel, roleTone } from "./account-format";

type AccountOrganizationsContentProps = {
  readonly actions?: Pick<AccountActions, "listAccountOrganizations">;
  readonly loading?: boolean;
  readonly error?: string;
};

export function AccountOrganizationsContent({
  actions = defaultAccountActions,
  loading,
  error: errorOverride,
}: AccountOrganizationsContentProps) {
  const skipFetch = loading || errorOverride;
  const { data, isLoading, error, mutate } = useSWR(skipFetch ? null : accountOrganizationsKey(), () => actions.listAccountOrganizations());
  const showLoading = loading ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const organizations = data?.organizations ?? [];

  const columns: readonly DataTableColumn<AccountOrganization>[] = [
    {
      key: "organization",
      label: "Organization",
      render: (organization) => (
        <Stack gap="xs">
          <Text>{organization.name}</Text>
          <Text variant="caption">{organization.slug ? `#${organization.slug}` : organization.id}</Text>
        </Stack>
      ),
    },
    { key: "role", label: "Role", render: (organization) => <Badge tone={roleTone(organization.role)}>{roleLabel(organization.role)}</Badge> },
    {
      key: "teams",
      label: "Teams",
      render: (organization) => organization.teams.length === 0 ? (
        <Text variant="caption">None</Text>
      ) : (
        <Inline>
          {organization.teams.map((team) => <Badge key={team.id} tone="neutral" size="sm">{team.name}</Badge>)}
        </Inline>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (organization) => organization.canOpenConsole && organization.consoleHref ? (
        <LinkButton href={organization.consoleHref} variant="secondary" iconName="ExternalLink">Open console</LinkButton>
      ) : (
        <Text variant="caption">Member access</Text>
      ),
    },
  ];

  if (showLoading) {
    return (
      <Stack>
        <PageIntro title="Organizations" description="Organizations where your account belongs and the console scopes you can operate." />
        <Panel><Skeleton rows={8} /></Panel>
      </Stack>
    );
  }

  if (showError) {
    return (
      <Stack>
        <PageIntro title="Organizations" description="Organizations where your account belongs and the console scopes you can operate." />
        <ErrorAlert message={showError} onRetry={() => void mutate()} />
      </Stack>
    );
  }

  return (
    <Stack>
      <PageIntro
        title="Organizations"
        description="Organizations where your account belongs and the console scopes you can operate."
      />
      <Panel padding={organizations.length > 0 ? "none" : "md"}>
        {organizations.length === 0 ? (
          <EmptyState message="No organization memberships" />
        ) : (
          <DataTable columns={columns} rows={organizations} getRowKey={(organization) => organization.id} />
        )}
      </Panel>
    </Stack>
  );
}

