import { useState } from "react";
import { Stack, Switch, Text } from "@idco/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Switch" } satisfies StoryDefault;

export const Interactive: Story = () => {
  const [on, setOn] = useState(true);
  return (
    <Stack gap="md">
      <Text variant="h2">Switch</Text>
      <Switch label={`Scope enabled (${on ? "on" : "off"})`} selected={on} onChange={setOn} />
    </Stack>
  );
};

export const Tones: Story = () => (
  <Stack gap="md">
    <Switch label="Primary (default)" defaultSelected tone="primary" />
    <Switch label="Success" defaultSelected tone="success" />
  </Stack>
);

export const Sizes: Story = () => (
  <Stack gap="md">
    <Switch label="Medium (default)" defaultSelected />
    <Switch label="Small" defaultSelected size="sm" />
  </Stack>
);

export const States: Story = () => (
  <Stack gap="md">
    <Switch label="Off" />
    <Switch label="On" defaultSelected />
    <Switch label="Disabled off" disabled />
    <Switch label="Disabled on" disabled defaultSelected />
  </Stack>
);
