import { Button, PageIntro, Stack } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Page Intro" } satisfies StoryDefault;

export const Full: Story = () => (
  <Stack gap="md">
    <PageIntro
      title="Users"
      description="People who can sign in. Create accounts, assign roles, verify emails, and ban access."
      info="Each user is a local account in this identity provider. The Role column controls admin access to this console; banning revokes active sessions immediately. Search by name or email, then open a row to manage that user."
      actions={<Button variant="primary" iconName="Plus">New User</Button>}
    />
  </Stack>
);

export const DescriptionOnly: Story = () => (
  <Stack gap="md">
    <PageIntro
      title="Signing Keys"
      description="The public keys that verify tokens this provider issues, published at the JWKS endpoint."
    />
  </Stack>
);

export const WithInfoNoActions: Story = () => (
  <Stack gap="md">
    <PageIntro
      title="Consents"
      description="A record of which applications each user has authorized, and the scopes they approved."
      info="Revoking a consent forces the user to re-approve the application on their next authorization request. It does not revoke already-issued tokens."
    />
  </Stack>
);

export const TitleOnly: Story = () => (
  <Stack gap="md">
    <PageIntro title="Dashboard" />
  </Stack>
);
