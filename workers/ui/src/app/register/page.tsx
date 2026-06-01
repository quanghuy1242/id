import { Page, Panel, Stack, Text } from "@id/ui";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Create your id account</Text>
          <RegisterForm />
        </Stack>
      </Panel>
    </Page>
  );
}
