import { Stack, Text, Timeline } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Timeline" } satisfies StoryDefault;

export const AuditLog: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Application audit</Text>
    <Timeline
      items={[
        {
          id: "1",
          icon: "RefreshCw",
          tone: "warning",
          title: "Secret rotated",
          meta: "by alice@acme.com · 2026-05-30 14:02",
          detail: "token_endpoint_auth_method unchanged",
        },
        {
          id: "2",
          icon: "Link2",
          tone: "primary",
          title: "Redirect URI added",
          meta: "by bob@acme.com · 2026-05-29 09:11",
          detail: "+ https://app.example.com/callback",
        },
        {
          id: "3",
          icon: "Plus",
          tone: "success",
          title: "Application created",
          meta: "by alice@acme.com · 2026-05-01 10:00",
        },
      ]}
    />
  </Stack>
);

export const Compact: Story = () => (
  <Timeline
    compact
    items={[
      { id: "1", title: "User banned", meta: "by admin · 12:00", tone: "error" },
      { id: "2", title: "Role changed to admin", meta: "by admin · 11:45" },
      { id: "3", title: "User created", meta: "by system · 09:00" },
    ]}
  />
);

export const Empty: Story = () => (
  <Stack gap="md">
    <Text variant="caption">No activity recorded.</Text>
    <Timeline items={[]} />
  </Stack>
);
