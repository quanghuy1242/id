import { ResponsiveBreadcrumb, Stack, Text } from "@idco/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Responsive Breadcrumb" } satisfies StoryDefault;

export const Short: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="caption">Resize the viewport to test overflow collapsing.</Text>
    <div className="max-w-lg w-full border border-base-300 rounded p-2">
      <ResponsiveBreadcrumb items={["Admin", "Dashboard"]} />
    </div>
  </Stack>
);

export const Long: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="caption">Resize the viewport to see items collapse into the ... menu.</Text>
    <div className="max-w-lg w-full border border-base-300 rounded p-2">
      <ResponsiveBreadcrumb items={["Admin", "Identity", "Users", "John Doe"]} />
    </div>
  </Stack>
);

export const VeryLong: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="caption">6 items — collapses aggressively on narrow viewports.</Text>
    <div className="max-w-lg w-full border border-base-300 rounded p-2">
      <ResponsiveBreadcrumb items={["Admin", "Identity", "Users", "John Doe", "Sessions", "Active"]} />
    </div>
  </Stack>
);

export const NarrowContainer: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="caption">Narrow container forces immediate collapse.</Text>
    <div className="w-48 border border-base-300 rounded p-2">
      <ResponsiveBreadcrumb items={["Admin", "Identity", "Users", "John Doe"]} />
    </div>
  </Stack>
);
