import { useState } from "react";
import { ResourceSelector, type ResourceOption, Stack, Text } from "@idco/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Resource Selector" } satisfies StoryDefault;

const members: ResourceOption[] = [
  { id: "u1", label: "Alice Nguyen", sublabel: "alice@acme.com", badge: "member" },
  { id: "u2", label: "Bob Tran", sublabel: "bob@acme.com", badge: "admin" },
  { id: "u3", label: "Carol Lee", sublabel: "carol@acme.com", badge: "member" },
  { id: "u4", label: "Dan Pham", sublabel: "dan@acme.com", badge: "member" },
];

const orgs: ResourceOption[] = [
  { id: "o1", label: "Acme Inc", sublabel: "acme" },
  { id: "o2", label: "Beta LLC", sublabel: "beta" },
];

export const SingleMember: Story = () => {
  const [value, setValue] = useState<string>("");
  return (
    <Stack gap="md">
      <Text variant="h2">Add team member</Text>
      <ResourceSelector
        kind="member"
        value={value}
        onChange={(next) => setValue(next as string)}
        source={{ mode: "sync", items: members }}
        excludeIds={["u3"]}
        placeholder="Search members…"
      />
    </Stack>
  );
};

export const MenuMember: Story = () => {
  const [value, setValue] = useState<string>("");
  return (
    <Stack gap="md">
      <Text variant="h2">Add team member</Text>
      <ResourceSelector
        kind="member"
        value={value}
        onChange={(next) => setValue(next as string)}
        source={{ mode: "sync", items: members }}
        variant="menu"
        width="compact"
        label="Add member"
        placeholder="Add member…"
      />
    </Stack>
  );
};

export const MultipleMembers: Story = () => {
  const [value, setValue] = useState<string[]>(["u1"]);
  return (
    <Stack gap="md">
      <Text variant="h2">Invite multiple</Text>
      <ResourceSelector
        kind="user"
        selectionMode="multiple"
        value={value}
        onChange={(next) => setValue(next as string[])}
        source={{ mode: "sync", items: members }}
      />
    </Stack>
  );
};

export const AsyncUserSearch: Story = () => {
  const [value, setValue] = useState<string>("");
  return (
    <Stack gap="md">
      <Text variant="caption">Async source — simulates a 400ms backend search.</Text>
      <ResourceSelector
        kind="user"
        value={value}
        onChange={(next) => setValue(next as string)}
        source={{
          mode: "async",
          load: async (query) => {
            await new Promise((r) => setTimeout(r, 400));
            return members.filter((m) => m.label.toLowerCase().includes(query.toLowerCase()));
          },
        }}
      />
    </Stack>
  );
};

export const Organizations: Story = () => {
  const [value, setValue] = useState<string>("");
  return (
    <ResourceSelector
      kind="organization"
      value={value}
      onChange={(next) => setValue(next as string)}
      source={{ mode: "sync", items: orgs }}
    />
  );
};
