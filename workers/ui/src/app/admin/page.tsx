import { Page, PageBody, PageHeader, Panel, Stack, Text } from "@id/ui";

export default function AdminPage() {
  return (
    <Page layout="dashboard">
      <PageHeader>
        <Text variant="h1">id admin</Text>
      </PageHeader>
      <PageBody>
        <Stack>
          <Panel>Scaffold. Full admin UI deferred to later batch.</Panel>
        </Stack>
      </PageBody>
    </Page>
  );
}
