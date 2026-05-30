import { Badge, DescriptionList, Stack, Text } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Description List" } satisfies StoryDefault;

export const TwoColumns: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Signing key</Text>
    <DescriptionList
      columns={2}
      items={[
        { term: "Algorithm", description: "EdDSA" },
        { term: "Status", description: <Badge tone="success">Active</Badge> },
        { term: "Created", description: "2026-01-15" },
        { term: "Expires", description: "2027-01-15" },
        { term: "Key ID", description: "abc123def456789", mono: true },
      ]}
    />
  </Stack>
);

export const SingleColumn: Story = () => (
  <DescriptionList
    columns={1}
    items={[
      { term: "Client ID", description: "cli_contentapi_8f3a2b", mono: true },
      { term: "Type", description: <Badge tone="primary">Confidential</Badge> },
    ]}
  />
);

export const Dense: Story = () => (
  <DescriptionList
    dense
    columns={3}
    items={[
      { term: "Sessions", description: "12" },
      { term: "Tokens", description: "44" },
      { term: "Consents", description: "8" },
    ]}
  />
);
