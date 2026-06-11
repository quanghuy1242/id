import { useState } from "react";
import { Badge, Button, DescriptionList, Drawer, Stack, Text } from "@idco/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Drawer" } satisfies StoryDefault;

export const QuickPeek: Story = () => {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="md">
      <Text variant="h2">Drawer</Text>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open key detail
      </Button>
      <Drawer open={open} onOpenChange={setOpen} title="Signing key" side="right" width="md">
        <DescriptionList
          columns={1}
          items={[
            { term: "Algorithm", description: "EdDSA" },
            { term: "Status", description: <Badge tone="success">Active</Badge> },
            { term: "Key ID", description: "abc123def456789", mono: true },
          ]}
        />
      </Drawer>
    </Stack>
  );
};

export const LeftSide: Story = () => {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="md">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open left drawer
      </Button>
      <Drawer open={open} onOpenChange={setOpen} title="Filters" side="left" width="sm">
        <Text variant="body">Drawer anchored to the left.</Text>
      </Drawer>
    </Stack>
  );
};
