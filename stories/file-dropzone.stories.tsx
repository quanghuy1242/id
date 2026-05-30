import { useState } from "react";
import { FileDropzone, Stack, Text } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / File Dropzone" } satisfies StoryDefault;

export const CsvImport: Story = () => {
  const [names, setNames] = useState<string[]>([]);
  return (
    <Stack gap="md">
      <Text variant="h2">Bulk import scopes</Text>
      <FileDropzone
        label="Upload CSV"
        accept={["text/csv", ".csv"]}
        hint="Columns: scope, resourceServer, description"
        onFiles={(files) => setNames(files.map((f) => f.name))}
      />
      {names.length > 0 ? <Text variant="caption">Selected: {names.join(", ")}</Text> : null}
    </Stack>
  );
};

export const MultipleWithSizeLimit: Story = () => {
  const [names, setNames] = useState<string[]>([]);
  return (
    <Stack gap="md">
      <FileDropzone
        label="Attachments (max 1 KB each)"
        multiple
        maxSizeBytes={1024}
        hint="Drop files or browse"
        onFiles={(files) => setNames(files.map((f) => f.name))}
      />
      {names.length > 0 ? <Text variant="caption">Accepted: {names.join(", ")}</Text> : null}
    </Stack>
  );
};
