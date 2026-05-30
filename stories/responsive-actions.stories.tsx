import { useState } from "react";
import { type ResponsiveAction, ResponsiveActions, Stack, Text } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Responsive Actions" } satisfies StoryDefault;

function DemoActions() {
  const [lastAction, setLastAction] = useState("None");
  const actions: ResponsiveAction[] = [
    { id: "edit", label: "Edit Profile", onAction: () => setLastAction("Edit Profile") },
    { id: "impersonate", label: "Impersonate", onAction: () => setLastAction("Impersonate") },
    { id: "role", label: "Set Role", onAction: () => setLastAction("Set Role") },
    { id: "password", label: "Reset Password", onAction: () => setLastAction("Reset Password") },
    { id: "ban", label: "Ban User", variant: "danger", onAction: () => setLastAction("Ban User") },
    { id: "delete", label: "Delete User", variant: "danger", onAction: () => setLastAction("Delete User") },
  ];

  return (
    <Stack gap="md">
      <ResponsiveActions ariaLabel="User actions" actions={actions} />
      <Text variant="caption">Last action: {lastAction}</Text>
    </Stack>
  );
}

export const Wide: Story = () => (
  <div className="max-w-4xl border border-base-300 rounded p-4">
    <DemoActions />
  </div>
);

export const Narrow: Story = () => (
  <div className="w-72 border border-base-300 rounded p-4">
    <DemoActions />
  </div>
);
