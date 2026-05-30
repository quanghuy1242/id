import { useState } from "react";
import { Stack, Text, UrlListBuilder } from "@id/ui";
import type { Story } from "@ladle/react";

export const RedirectUris: Story = () => {
  const [value, setValue] = useState<string[]>([
    "https://app.example.com/callback",
    "http://localhost:3000/callback",
  ]);
  return (
    <Stack gap="md">
      <Text variant="h2">Redirect URIs</Text>
      <UrlListBuilder label="Redirect URIs" value={value} onChange={setValue} addLabel="Add redirect URI" />
    </Stack>
  );
};

export const Empty: Story = () => {
  const [value, setValue] = useState<string[]>([]);
  return <UrlListBuilder label="Post-logout redirect URIs" value={value} onChange={setValue} />;
};

export const WithInvalidRow: Story = () => {
  const [value, setValue] = useState<string[]>([
    "https://ok.example.com/cb",
    "http://insecure.example.com",
    "https://app.example.com/cb#fragment",
  ]);
  return (
    <Stack gap="md">
      <Text variant="caption">Rows 2 and 3 fail the default validator.</Text>
      <UrlListBuilder label="Redirect URIs" value={value} onChange={setValue} />
    </Stack>
  );
};

export const Compact: Story = () => {
  const [value, setValue] = useState<string[]>(["https://app.example.com/callback"]);
  return <UrlListBuilder label="Redirect URIs" value={value} onChange={setValue} size="sm" />;
};
