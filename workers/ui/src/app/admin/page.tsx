import { Page, PageBody, PageHeader, Panel, Stack, Heading } from "@id/ui";

export default function AdminPage() {
  return (
    <Page layout="dashboard">
      <PageHeader>
        <Heading level="h1">id admin</Heading>
      </PageHeader>
      <PageBody>
        <Stack>
          <Panel>Scaffold. Full admin UI deferred to later batch.</Panel>
        </Stack>
      </PageBody>
    </Page>
  );
}
