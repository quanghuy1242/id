import { Page, Panel, Stack, Text } from "@idco/ui";
import { SelectContextForm } from "./select-context-form";

export default function SelectAuthorizationContextPage() {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Choose access context</Text>
          <Text variant="body">
            Select how you want to access this application.
          </Text>
          <SelectContextForm />
        </Stack>
      </Panel>
    </Page>
  );
}
