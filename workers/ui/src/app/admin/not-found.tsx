"use client";

import Link from "next/link";
import { PageBody, Panel, Stack, Text, Heading, Button } from "@id/ui";

export default function AdminNotFound() {
  return (
    <PageBody>
      <Stack gap="md">
        <Heading level="h1">Page not found</Heading>
        <Panel>
          <Stack gap="md">
            <Text variant="body">
              This page isn&apos;t available yet. It may appear in a future update.
            </Text>
            <Link href="/admin">
              <Button variant="primary" size="sm">Back to Dashboard</Button>
            </Link>
          </Stack>
        </Panel>
      </Stack>
    </PageBody>
  );
}
