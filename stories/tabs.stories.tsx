import { useState } from "react";
import { Badge, Inline, Stack, Tabs, Text, type LinkTabItem, type PanelTabItem } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Tabs" } satisfies StoryDefault;

const panelTabs: PanelTabItem[] = [
  {
    id: "overview",
    label: "Overview",
    content: (
      <Stack gap="sm">
        <Text variant="h3">Overview</Text>
        <Text>High-level identity activity and policy status.</Text>
      </Stack>
    ),
  },
  {
    id: "members",
    label: "Members",
    content: (
      <Stack gap="sm">
        <Text variant="h3">Members</Text>
        <Text>Directory-backed members, roles, and invitation state.</Text>
      </Stack>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    disabled: true,
    content: (
      <Stack gap="sm">
        <Text variant="h3">Settings</Text>
        <Text>Disabled until organization settings are implemented.</Text>
      </Stack>
    ),
  },
];

const routedTabs: LinkTabItem[] = [
  { id: "users", href: "/admin/identity/users", label: "Users" },
  { id: "organizations", href: "/admin/identity/organizations", label: "Organizations" },
];

export const PanelTabs: Story = () => {
  const [selected, setSelected] = useState("overview");

  return (
    <Stack gap="md">
      <Inline gap="sm" align="center">
        <Text variant="h2">React Aria Tabs</Text>
        <Badge tone="info">selected: {selected}</Badge>
      </Inline>
      <Tabs
        ariaLabel="Example panel tabs"
        items={panelTabs}
        selectedKey={selected}
        onSelectionChange={setSelected}
      />
    </Stack>
  );
};

export const BoxedPanelTabs: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Boxed Tabs</Text>
    <Tabs
      ariaLabel="Boxed example tabs"
      items={panelTabs}
      defaultSelectedKey="members"
      variant="box"
    />
  </Stack>
);

export const SmallPanelTabs: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Small Tabs</Text>
    <Tabs
      ariaLabel="Small example tabs"
      items={panelTabs}
      defaultSelectedKey="overview"
      size="sm"
    />
  </Stack>
);

export const RoutedTabLinks: Story = () => (
  <Stack gap="md">
    <Text variant="h2">URL Tab Links</Text>
    <Tabs
      ariaLabel="Identity tabs"
      items={routedTabs}
      selectedKey="users"
    />
  </Stack>
);
