import { Disclosure, DisclosureGroup, DescriptionList, Stack, Text } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Disclosure" } satisfies StoryDefault;

export const Single: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Disclosure</Text>
    <Disclosure title="Advanced settings">
      <DescriptionList
        items={[
          { term: "Token endpoint auth", description: "client_secret_basic" },
          { term: "PKCE", description: "Required" },
        ]}
      />
    </Disclosure>
  </Stack>
);

export const DefaultExpanded: Story = () => (
  <Disclosure title="Connection details" defaultExpanded>
    <Text variant="body">This panel starts expanded.</Text>
  </Disclosure>
);

export const PlusIcon: Story = () => (
  <Disclosure title="What is a resource indicator?" icon="plus">
    <Text variant="body">RFC 8707 lets a client request tokens scoped to a specific resource server.</Text>
  </Disclosure>
);

export const Group: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Accordion (single open)</Text>
    <DisclosureGroup defaultExpandedKeys={["a"]}>
      <Disclosure id="a" title="Section A">
        <Text variant="body">Body A</Text>
      </Disclosure>
      <Disclosure id="b" title="Section B">
        <Text variant="body">Body B</Text>
      </Disclosure>
      <Disclosure id="c" title="Section C">
        <Text variant="body">Body C</Text>
      </Disclosure>
    </DisclosureGroup>
  </Stack>
);
