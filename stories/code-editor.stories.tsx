import { useState } from "react";
import { CodeEditor, Stack, Text } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Code Editor" } satisfies StoryDefault;

export const MetadataEditor: Story = () => {
  const [value, setValue] = useState('{\n  "logo_uri": "https://acme.com/logo.png",\n  "tos_uri": "https://acme.com/tos"\n}');
  let error: string | undefined;
  try {
    JSON.parse(value);
  } catch {
    error = "Invalid JSON";
  }
  return (
    <Stack gap="md">
      <Text variant="h2">Client metadata</Text>
      <CodeEditor label="metadata (JSON)" value={value} onChange={setValue} error={error} />
    </Stack>
  );
};

export const ReadOnly: Story = () => (
  <CodeEditor label="Generated config" value={'{\n  "issuer": "https://id.example.com"\n}'} onChange={() => {}} readOnly />
);
