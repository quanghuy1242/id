import { Button, JsonViewer, Stack, Text } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / JSON Viewer" } satisfies StoryDefault;

const publicJwk = {
  kty: "OKP",
  crv: "Ed25519",
  x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
  kid: "abc123def456",
  use: "sig",
  alg: "EdDSA",
};

export const PublicJwk: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Public JWK</Text>
    <JsonViewer value={publicJwk} label="abc123def456.jwk.json" action={<Button size="sm" variant="secondary" iconName="Copy">Copy</Button>} maxHeight="md" />
  </Stack>
);

export const FromString: Story = () => (
  <JsonViewer value='{"sub":"user_123","scope":"openid profile","active":true,"exp":1735689600}' label="Decoded token" />
);

export const InvalidString: Story = () => (
  <Stack gap="md">
    <Text variant="caption">Invalid JSON falls back to raw text.</Text>
    <JsonViewer value="<not json>" />
  </Stack>
);
