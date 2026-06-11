import { Page, Panel, Stack, Text } from "@idco/ui";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Sign in</Text>
          <LoginForm />
        </Stack>
      </Panel>
    </Page>
  );
}
