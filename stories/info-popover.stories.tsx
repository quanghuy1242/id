import { InfoPopover, Inline, Stack, Text } from "@idco/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Info Popover" } satisfies StoryDefault;

export const NextToALabel: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="h2">Teaching popover beside a label</Text>
    <Inline gap="xs" align="center">
      <Text variant="caption">Role</Text>
      <InfoPopover title="Roles" label="About roles">
        Owner can manage billing and delete the organization; Admin manages members and teams; Member has standard
        access. Keep at least one Owner active.
      </InfoPopover>
    </Inline>
  </Stack>
);

export const IconVariants: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="h2">Info vs. help icon</Text>
    <Inline gap="md" align="center">
      <Inline gap="xs" align="center">
        <Text variant="caption">Info (ⓘ)</Text>
        <InfoPopover label="Info example" icon="info">Explains what a thing is.</InfoPopover>
      </Inline>
      <Inline gap="xs" align="center">
        <Text variant="caption">Help (?)</Text>
        <InfoPopover label="Help example" icon="help">Answers "how do I use this?"</InfoPopover>
      </Inline>
    </Inline>
  </Stack>
);

export const Sizes: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="h2">Trigger sizes</Text>
    <Inline gap="md" align="center">
      <InfoPopover label="Extra small" size="xs">Default xs trigger, used inline beside captions.</InfoPopover>
      <InfoPopover label="Small" size="sm">Slightly larger sm trigger, used beside page titles.</InfoPopover>
    </Inline>
  </Stack>
);

export const Placements: Story = () => (
  <Stack gap="lg" align="start">
    <Text variant="h2">Placements</Text>
    <Inline gap="lg" align="center">
      <InfoPopover label="Top" placement="top">Opens above the trigger.</InfoPopover>
      <InfoPopover label="Bottom" placement="bottom">Opens below the trigger.</InfoPopover>
      <InfoPopover label="Right" placement="right">Opens to the right.</InfoPopover>
    </Inline>
  </Stack>
);
