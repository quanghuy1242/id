import { Page, Panel, Stack, Text } from "@idco/ui";
import { ConsentForm } from "./consent-form";

export default function ConsentPage() {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Authorize application</Text>
          <ConsentForm />
        </Stack>
      </Panel>
    </Page>
  );
}
