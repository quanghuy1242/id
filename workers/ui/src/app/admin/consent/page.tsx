import { Page, PageBody, PageHeader, Panel, Text } from "@id/ui";
import { ConsentForm } from "./consent-form";

export default function ConsentPage() {
  return (
    <Page>
      <PageHeader>
        <Text variant="h1">Authorize application</Text>
      </PageHeader>
      <PageBody>
        <Panel>
          <ConsentForm />
        </Panel>
      </PageBody>
    </Page>
  );
}
