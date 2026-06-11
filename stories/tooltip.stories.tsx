import { Button, Inline, Stack, Text, Tooltip } from "@idco/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Tooltip" } satisfies StoryDefault;

export const OnIconButtons: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Tooltips on icon buttons</Text>
    <Text variant="caption">Hover or keyboard-focus a button to reveal its hint.</Text>
    <Inline gap="sm">
      <Button iconName="Pencil" ariaLabel="Edit" variant="secondary" tooltip="Edit application" />
      <Button iconName="RefreshCw" ariaLabel="Rotate" variant="secondary" tooltip="Rotate client secret" />
      <Button iconName="Trash2" ariaLabel="Delete" variant="danger" tooltip="Delete application" />
      <Button iconName="Copy" ariaLabel="Copy" variant="secondary" tooltip="Copy to clipboard" />
    </Inline>
  </Stack>
);

export const Placements: Story = () => (
  <Stack gap="lg" align="start">
    <Text variant="h2">Placements</Text>
    <Inline gap="lg">
      <Button iconName="Info" ariaLabel="Top" variant="secondary" tooltip="Top tooltip" tooltipPlacement="top" />
      <Button iconName="Info" ariaLabel="Bottom" variant="secondary" tooltip="Bottom tooltip" tooltipPlacement="bottom" />
      <Button iconName="Info" ariaLabel="Left" variant="secondary" tooltip="Left tooltip" tooltipPlacement="left" />
      <Button iconName="Info" ariaLabel="Right" variant="secondary" tooltip="Right tooltip" tooltipPlacement="right" />
    </Inline>
  </Stack>
);

export const StandaloneWrapper: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="h2">Wrapping a focusable child</Text>
    <Tooltip content="Wrapped via the Tooltip component">
      <Button variant="primary">Hover me</Button>
    </Tooltip>
    <Text variant="caption">Empty content renders the child without a tooltip.</Text>
    <Tooltip content="">
      <Button variant="secondary">No tooltip</Button>
    </Tooltip>
  </Stack>
);
