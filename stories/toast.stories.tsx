import { Button, Inline, Stack, Text, ToastRegion, toast } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Toast" } satisfies StoryDefault;

export const Tones: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="h2">Toast tones</Text>
    <Text variant="caption">
      Success / info / warning auto-dismiss after 5s; errors persist until closed. Toasts stack bottom-end.
    </Text>
    <Inline gap="sm">
      <Button variant="primary" onClick={() => toast.success("User created", "alex@example.com can now sign in.")}>
        Success
      </Button>
      <Button variant="secondary" onClick={() => toast.info("Processing", "Revoking the selected session…")}>
        Info
      </Button>
      <Button variant="secondary" onClick={() => toast.warning("Heads up", "This client has no redirect URIs configured.")}>
        Warning
      </Button>
      <Button variant="danger" onClick={() => toast.error("Couldn't save", "The slug is already taken.")}>
        Error
      </Button>
    </Inline>
    <ToastRegion />
  </Stack>
);

export const TitleOnly: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="h2">Title only</Text>
    <Button variant="primary" onClick={() => toast.success("Copied to clipboard")}>
      Copy something
    </Button>
    <ToastRegion />
  </Stack>
);

export const Stacking: Story = () => (
  <Stack gap="md" align="start">
    <Text variant="h2">Multiple toasts</Text>
    <Button
      variant="primary"
      onClick={() => {
        toast.success("Saved", "Profile updated.");
        toast.info("Synced", "Directory refreshed.");
        toast.warning("Almost full", "Approaching the seat limit.");
      }}
    >
      Raise three
    </Button>
    <ToastRegion />
  </Stack>
);
