import { Suspense } from "react";
import { Page, Panel, Skeleton, Stack, Text } from "@idco/ui";
import { VerifyEmailStatus } from "./verify-email-status";

export default function VerifyEmailPage() {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Verifying email</Text>
          <Suspense fallback={<Skeleton rows={3} />}>
            <VerifyEmailStatus />
          </Suspense>
        </Stack>
      </Panel>
    </Page>
  );
}

