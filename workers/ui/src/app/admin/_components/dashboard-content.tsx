"use client";

import useSWR from "swr";
import {
  Badge,
  Grid,
  LinkButton,
  PageIntro,
  Panel,
  Stack,
  Stat,
  StatGroup,
  StatSummaryGroup,
  Text,
} from "@id/ui";
import {
  listAdminConsents,
  listAdminJwks,
  listAdminSessions,
  listAdminTokens,
} from "../_actions/audit";
import { listClients, clientType } from "../_actions/oauth";
import { listOrganizations } from "../_actions/organizations";
import { listUsers } from "../_actions/users";
import {
  adminConsentsKey,
  adminJwksKey,
  adminSessionsKey,
  adminTokensKey,
  oauthClientsKey,
  orgsListKey,
  usersListKey,
} from "../_data/swr-keys";

const dashboardPage = { limit: 1, offset: 0 };

const defaultActions = {
  listUsers,
  listOrganizations,
  listClients,
  listAdminSessions,
  listAdminTokens,
  listAdminConsents,
  listAdminJwks,
};

type DashboardContentProps = {
  readonly actions?: typeof defaultActions;
};

const sections = [
  { href: "/admin/platform/identity/users", title: "Users", body: "Create accounts, assign roles, verify emails, and manage bans." },
  { href: "/admin/platform/identity/organizations", title: "Organizations", body: "Manage tenants, their members, teams, and invitations." },
  { href: "/admin/platform/oauth/applications", title: "OAuth Applications", body: "Register clients, manage secrets, scopes, and redirect URIs." },
  { href: "/admin/platform/security/sessions", title: "Sessions", body: "Review live browser sessions and revoke active grants." },
  { href: "/admin/platform/security/tokens?type=access", title: "Tokens", body: "Inspect issued token prefixes without exposing token bodies." },
  { href: "/admin/platform/security/introspect", title: "Token Decoder", body: "Decode JWTs and call the RFC 7662 introspection endpoint." },
  { href: "/admin/platform/security/jwks", title: "Signing Keys", body: "Inspect public JWKS metadata and emergency-rotate signing keys." },
  { href: "/admin/platform/security/consents", title: "Consents", body: "Review and revoke the apps users have authorized." },
];

function statValue(value: number | undefined): string {
  return value === undefined ? "..." : String(value);
}

export function DashboardContent({ actions = defaultActions }: DashboardContentProps) {
  const { data: users } = useSWR(usersListKey(dashboardPage), () => actions.listUsers(dashboardPage));
  const { data: organizations } = useSWR(orgsListKey(), () => actions.listOrganizations());
  const { data: clients } = useSWR(oauthClientsKey(), () => actions.listClients());
  const { data: sessions } = useSWR(adminSessionsKey(dashboardPage), () => actions.listAdminSessions(dashboardPage));
  const { data: accessTokens } = useSWR(adminTokensKey({ ...dashboardPage, type: "access" }), () => actions.listAdminTokens({ ...dashboardPage, type: "access" }));
  const { data: refreshTokens } = useSWR(adminTokensKey({ ...dashboardPage, type: "refresh" }), () => actions.listAdminTokens({ ...dashboardPage, type: "refresh" }));
  const { data: consents } = useSWR(adminConsentsKey(dashboardPage), () => actions.listAdminConsents(dashboardPage));
  const { data: jwks } = useSWR(adminJwksKey(), () => actions.listAdminJwks());

  const totalClients = clients?.length;
  const m2mClients = clients?.filter((client) => clientType(client) === "M2M").length;
  const activeKeys = jwks?.filter((key) => key.status === "active").length;
  const rotatedKeys = jwks?.filter((key) => key.status === "rotated").length;
  const expiredKeys = jwks?.filter((key) => key.status === "expired").length;

  return (
    <Stack gap="lg">
      <PageIntro
        title="Admin Console"
        description="Manage identities, organizations, OAuth clients, and the security surface of this identity provider."
        info="This console is the control plane for the identity provider. The dashboard summarizes the live admin read endpoints; use the shortcuts below for detailed workflows."
      />
      <StatSummaryGroup>
        <StatGroup columns={4} density="compact" frame="seamless">
          <Stat title="Users" value={statValue(users?.total)} description="registered accounts" tone="primary" />
          <Stat title="Organizations" value={statValue(organizations?.length)} description="tenants" />
          <Stat title="OAuth Apps" value={statValue(totalClients)} description={`${statValue(m2mClients)} M2M`} tone="info" />
          <Stat title="Active Sessions" value={statValue(sessions?.total)} description="browser grants" tone="success" />
        </StatGroup>
        <StatGroup columns={4} density="compact" frame="seamless">
          <Stat title="Access Tokens" value={statValue(accessTokens?.total)} description="prefixes only" />
          <Stat title="Refresh Tokens" value={statValue(refreshTokens?.total)} description="prefixes only" />
          <Stat title="Consents" value={statValue(consents?.total)} description="active grants" />
          <Stat title="Signing Keys" value={statValue(jwks?.length)} description={`${statValue(activeKeys)} active · ${statValue(rotatedKeys)} rotated · ${statValue(expiredKeys)} expired`} />
        </StatGroup>
      </StatSummaryGroup>
      <Grid columns="three" gap="md">
        {sections.map((section) => (
          <Panel key={section.href}>
            <Stack gap="md" justify="between" fill>
              <Stack gap="sm">
                <Text variant="h3">{section.title}</Text>
                <Text variant="caption">{section.body}</Text>
                {section.href.includes("/security/") ? <Badge tone="info" size="sm">Security</Badge> : null}
              </Stack>
              <LinkButton href={section.href} variant="secondary" size="sm">Open</LinkButton>
            </Stack>
          </Panel>
        ))}
      </Grid>
    </Stack>
  );
}
