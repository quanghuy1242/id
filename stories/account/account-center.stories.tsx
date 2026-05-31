import type { ReactNode } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { SWRConfig } from "swr";
import { PageBody } from "@id/ui";
import { ADMIN_SWR_CONFIG } from "../../workers/ui/src/shared/swr-config";
import { setMockPathname } from "../../.ladle/mocks/next-navigation";
import { AccountShell } from "../../workers/ui/src/app/account/_components/account-shell";
import { AccountOverviewContent } from "../../workers/ui/src/app/account/_components/account-overview-content";
import { AccountProfileContent } from "../../workers/ui/src/app/account/_components/account-profile-content";
import { AccountSecurityContent } from "../../workers/ui/src/app/account/_components/account-security-content";
import { AccountSessionsContent } from "../../workers/ui/src/app/account/_components/account-sessions-content";
import { AccountConsentsContent } from "../../workers/ui/src/app/account/_components/account-consents-content";
import { AccountOrganizationsContent } from "../../workers/ui/src/app/account/_components/account-organizations-content";
import type { AccountActions } from "../../workers/ui/src/app/account/_actions/account";
import {
  createMockAccountActions,
  mockAccountSummary,
} from "../../workers/ui/src/app/account/_mocks/account";

export default { title: "Account Center" } satisfies StoryDefault;

function AccountStoryShell({
  activePath,
  actions = createMockAccountActions(),
  children,
}: {
  readonly activePath: string;
  readonly actions?: AccountActions;
  readonly children: ReactNode;
}) {
  setMockPathname(activePath);
  if (typeof window !== "undefined") window.history.replaceState({}, "", activePath);

  return (
    <SWRConfig value={{ ...ADMIN_SWR_CONFIG, provider: () => new Map() }}>
      <AccountShell actions={actions} onLogout={() => undefined}>
        <PageBody>{children}</PageBody>
      </AccountShell>
    </SWRConfig>
  );
}

const emptyActions = createMockAccountActions({
  getAccountSummary: async () => ({
    ...mockAccountSummary,
    counts: { organizations: 0, activeSessions: 0, connectedApplications: 0 },
  }),
  listAccountSessions: async () => ({ sessions: [] }),
  listAccountConsents: async () => ({ consents: [] }),
  listAccountOrganizations: async () => ({ organizations: [] }),
});

export const Overview_Populated: Story = () => (
  <AccountStoryShell activePath="/account">
    <AccountOverviewContent actions={createMockAccountActions()} />
  </AccountStoryShell>
);

export const Overview_Empty: Story = () => (
  <AccountStoryShell activePath="/account" actions={emptyActions}>
    <AccountOverviewContent actions={emptyActions} />
  </AccountStoryShell>
);

export const Overview_Loading: Story = () => (
  <AccountStoryShell activePath="/account">
    <AccountOverviewContent loading />
  </AccountStoryShell>
);

export const Overview_Error: Story = () => (
  <AccountStoryShell activePath="/account">
    <AccountOverviewContent error="Failed to load account summary" />
  </AccountStoryShell>
);

export const Profile_Populated: Story = () => (
  <AccountStoryShell activePath="/account/profile">
    <AccountProfileContent actions={createMockAccountActions()} />
  </AccountStoryShell>
);

export const Profile_Loading: Story = () => (
  <AccountStoryShell activePath="/account/profile">
    <AccountProfileContent loading />
  </AccountStoryShell>
);

export const Profile_Error: Story = () => (
  <AccountStoryShell activePath="/account/profile">
    <AccountProfileContent error="Failed to load profile" />
  </AccountStoryShell>
);

export const Security_Populated: Story = () => (
  <AccountStoryShell activePath="/account/security">
    <AccountSecurityContent actions={createMockAccountActions()} />
  </AccountStoryShell>
);

export const Security_Loading: Story = () => (
  <AccountStoryShell activePath="/account/security">
    <AccountSecurityContent loading />
  </AccountStoryShell>
);

export const Security_Error: Story = () => (
  <AccountStoryShell activePath="/account/security">
    <AccountSecurityContent error="Failed to load security settings" />
  </AccountStoryShell>
);

export const Sessions_Populated: Story = () => (
  <AccountStoryShell activePath="/account/sessions">
    <AccountSessionsContent actions={createMockAccountActions()} onSignedOut={() => undefined} />
  </AccountStoryShell>
);

export const Sessions_Empty: Story = () => (
  <AccountStoryShell activePath="/account/sessions" actions={emptyActions}>
    <AccountSessionsContent actions={emptyActions} onSignedOut={() => undefined} />
  </AccountStoryShell>
);

export const Sessions_Loading: Story = () => (
  <AccountStoryShell activePath="/account/sessions">
    <AccountSessionsContent loading />
  </AccountStoryShell>
);

export const Sessions_Error: Story = () => (
  <AccountStoryShell activePath="/account/sessions">
    <AccountSessionsContent error="Failed to load sessions" />
  </AccountStoryShell>
);

export const Consents_Populated: Story = () => (
  <AccountStoryShell activePath="/account/consents">
    <AccountConsentsContent actions={createMockAccountActions()} />
  </AccountStoryShell>
);

export const Consents_Empty: Story = () => (
  <AccountStoryShell activePath="/account/consents" actions={emptyActions}>
    <AccountConsentsContent actions={emptyActions} />
  </AccountStoryShell>
);

export const Consents_Loading: Story = () => (
  <AccountStoryShell activePath="/account/consents">
    <AccountConsentsContent loading />
  </AccountStoryShell>
);

export const Consents_Error: Story = () => (
  <AccountStoryShell activePath="/account/consents">
    <AccountConsentsContent error="Failed to load connected applications" />
  </AccountStoryShell>
);

export const Organizations_Populated: Story = () => (
  <AccountStoryShell activePath="/account/organizations">
    <AccountOrganizationsContent actions={createMockAccountActions()} />
  </AccountStoryShell>
);

export const Organizations_Empty: Story = () => (
  <AccountStoryShell activePath="/account/organizations" actions={emptyActions}>
    <AccountOrganizationsContent actions={emptyActions} />
  </AccountStoryShell>
);

export const Organizations_Loading: Story = () => (
  <AccountStoryShell activePath="/account/organizations">
    <AccountOrganizationsContent loading />
  </AccountStoryShell>
);

export const Organizations_Error: Story = () => (
  <AccountStoryShell activePath="/account/organizations">
    <AccountOrganizationsContent error="Failed to load organizations" />
  </AccountStoryShell>
);
