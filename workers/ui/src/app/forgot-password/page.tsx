import { Page, Panel, Stack, Text } from "@id/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Reset your password</Text>
          <Text variant="caption">Enter the email address for your account.</Text>
          <ForgotPasswordForm />
        </Stack>
      </Panel>
    </Page>
  );
}

