import { Stat, StatGroup, StatSummaryGroup, Stack, Text } from "@idco/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Stat" } satisfies StoryDefault;

export const SigningKeys: Story = () => (
  <Stack gap="md">
    <Text variant="h2">JWKS summary</Text>
    <StatGroup columns={4}>
      <Stat title="Total keys" value={4} description="all signing" iconName="KeyRound" />
      <Stat title="Active" value={1} tone="success" description="signs new" iconName="Check" />
      <Stat title="Rotated" value={2} tone="warning" description="in grace" iconName="RefreshCw" />
      <Stat title="Expired" value={1} tone="neutral" description="audit only" />
    </StatGroup>
  </Stack>
);

export const Users: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Users summary</Text>
    <StatGroup columns={4}>
      <Stat title="Total" value="1,204" iconName="Users" />
      <Stat title="Admins" value={6} tone="primary" />
      <Stat title="Banned" value={3} tone="error" />
      <Stat title="Unverified" value={41} tone="warning" />
    </StatGroup>
  </Stack>
);

export const DashboardSummary: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Dashboard summary</Text>
    <StatSummaryGroup>
      <StatGroup columns={4} density="compact" frame="seamless">
        <Stat title="Users" value="1,204" tone="primary" />
        <Stat title="Organizations" value={42} />
        <Stat title="OAuth Apps" value={18} tone="info" />
        <Stat title="Active Sessions" value={321} tone="success" />
      </StatGroup>
      <StatGroup columns={4} density="compact" frame="seamless">
        <Stat title="Access Tokens" value={88} />
        <Stat title="Refresh Tokens" value={45} />
        <Stat title="Consents" value={156} />
        <Stat title="Signing Keys" value={4} />
      </StatGroup>
    </StatSummaryGroup>
  </Stack>
);

export const WithMeter: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Capacity</Text>
    <StatGroup columns={2}>
      <Stat title="Days to rotation" value="312 / 365" tone="info" meter={{ value: 312, max: 365 }} />
      <Stat title="Consents used" value="80%" tone="success" meter={{ value: 80, max: 100 }} />
    </StatGroup>
  </Stack>
);

export const TwoColumns: Story = () => (
  <StatGroup columns={2}>
    <Stat title="Organizations" value={37} iconName="Building2" />
    <Stat title="Teams" value={88} iconName="Users" />
  </StatGroup>
);

export const InlineCompact: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="h2">Compact summary</Text>
    <StatGroup layout="inline">
      <Stat title="Active" value={18} tone="success" />
      <Stat title="Pending" value={4} tone="warning" />
      <Stat title="Disabled" value={2} tone="neutral" />
    </StatGroup>
  </Stack>
);
