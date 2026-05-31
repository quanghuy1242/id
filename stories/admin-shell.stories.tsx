import type { Story, StoryDefault } from "@ladle/react";
import type { ConsolePermission, ConsoleScope, ConsoleScopeEnvelope } from "@id/lib";
import { PageBody, Panel, Stack, Text } from "@id/ui";
import { AdminShell } from "./_decorators/shell";

const orgPermissions: readonly ConsolePermission[] = [
  "members:read",
  "members:write",
  "oauth-clients:read",
  "oauth-clients:write",
  "resource-servers:read",
  "resource-servers:write",
  "security-audit:read",
];

function acmeScope(role: ConsoleScope["role"]): ConsoleScope {
  return {
    kind: "organization",
    id: "organization:org_acme",
    organizationId: "org_acme",
    label: "Acme Publishing",
    role,
    permissions: orgPermissions,
    requiresStepUp: false,
  };
}

const platformEnvelope: ConsoleScopeEnvelope = {
  actor: { userId: "usr_platform", email: "platform@example.test", canEnterConsole: true },
  scopes: [
    {
      kind: "platform",
      id: "platform",
      label: "Platform",
      role: "platform-admin",
      permissions: [
        "platform:read",
        "platform:write",
        "organizations:read",
        "organizations:write",
        "oauth-clients:read",
        "oauth-clients:write",
        "resource-servers:read",
        "resource-servers:write",
        "security-audit:read",
        "jwks:read",
        "jwks:rotate",
        "system:read",
        "system:write",
      ],
      requiresStepUp: true,
    },
    acmeScope("owner"),
  ],
  memberships: [{ organizationId: "org_initech", label: "Initech", role: "member" }],
  defaultScopeId: "platform",
};

const orgEnvelope: ConsoleScopeEnvelope = {
  actor: { userId: "usr_org", email: "owner@acme.example", canEnterConsole: true },
  scopes: [acmeScope("admin")],
  memberships: [{ organizationId: "org_initech", label: "Initech", role: "member" }],
  defaultScopeId: "organization:org_acme",
};

function Placeholder() {
  return (
    <PageBody>
      <Panel>
        <Stack gap="sm">
          <Text variant="body">Acme Publishing operator console</Text>
          <Text variant="caption">Recent administrative activity will appear here once the scoped dashboard is connected.</Text>
        </Stack>
      </Panel>
    </PageBody>
  );
}

export default {
  title: "Admin / Shell",
} satisfies StoryDefault;

export const PlatformLens: Story = () => (
  <AdminShell activePath="/admin/platform/access/resource-apis" scopeEnvelope={platformEnvelope}>
    <Placeholder />
  </AdminShell>
);

export const OrganizationLens: Story = () => (
  <AdminShell activePath="/admin/orgs/org_acme/identity/members" scopeEnvelope={orgEnvelope}>
    <Placeholder />
  </AdminShell>
);
