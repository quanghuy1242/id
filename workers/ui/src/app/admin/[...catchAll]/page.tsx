import { PageBody, Panel, Stack, Text, Heading, LinkButton } from "@idco/ui";

export default function AdminCatchAll() {
  return (
    <PageBody>
      <Stack gap="md">
        <Heading level="h1">Page not found</Heading>
        <Panel>
          <Stack gap="md" align="start">
            <Text variant="body">
              This page isn&apos;t available yet. It may appear in a future update.
            </Text>
            <LinkButton href="/admin" variant="primary">
              Back to Dashboard
            </LinkButton>
          </Stack>
        </Panel>
      </Stack>
    </PageBody>
  );
}
