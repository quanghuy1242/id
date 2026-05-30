import { useState } from "react";
import { ScopeBuilder, Stack, Text } from "@id/ui";
import type { Story } from "@ladle/react";

const catalog = [
  { value: "openid", description: "OpenID Connect" },
  { value: "profile", description: "Basic profile" },
  { value: "email", description: "Email address" },
  { value: "offline_access", description: "Refresh tokens" },
  { value: "content:read", description: "Content API", group: "Content API" },
  { value: "content:write", description: "Content API", group: "Content API" },
  { value: "billing:read", description: "Billing API", group: "Billing API" },
];

export const Populated: Story = () => {
  const [value, setValue] = useState<string[]>(["openid", "profile", "content:read"]);
  return (
    <Stack gap="md">
      <Text variant="h2">Client scopes</Text>
      <ScopeBuilder label="Scopes" value={value} onChange={setValue} suggestions={catalog} name="scope" />
      <Text variant="caption">Serialized: {value.join(" ") || "—"}</Text>
    </Stack>
  );
};

export const Empty: Story = () => {
  const [value, setValue] = useState<string[]>([]);
  return <ScopeBuilder label="Scopes" value={value} onChange={setValue} suggestions={catalog} />;
};

export const AllowCustom: Story = () => {
  const [value, setValue] = useState<string[]>(["content:read"]);
  return (
    <Stack gap="md">
      <Text variant="caption">Type a custom scope (lowercase) and pick “Add …”.</Text>
      <ScopeBuilder label="Scopes" value={value} onChange={setValue} suggestions={catalog} allowCustom />
    </Stack>
  );
};

export const StaleCatalogChip: Story = () => {
  const [value, setValue] = useState<string[]>(["openid", "legacy:scope"]);
  return (
    <Stack gap="md">
      <Text variant="caption">“legacy:scope” is not in the catalog — it renders as a warning chip.</Text>
      <ScopeBuilder label="Scopes" value={value} onChange={setValue} suggestions={catalog} />
    </Stack>
  );
};
