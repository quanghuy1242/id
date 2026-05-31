import { Suspense } from "react";
import { Page, Panel, Skeleton, Stack, Text } from "@id/ui";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Choose a new password</Text>
          <Suspense fallback={<Skeleton rows={4} />}>
            <ResetPasswordForm />
          </Suspense>
        </Stack>
      </Panel>
    </Page>
  );
}

