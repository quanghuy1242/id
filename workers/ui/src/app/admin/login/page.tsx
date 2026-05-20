import { Page, PageBody, PageHeader, Panel, Text } from "@id/ui";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Page>
      <PageHeader>
        <Text variant="h1">Sign in</Text>
      </PageHeader>
      <PageBody>
        <Panel>
          <LoginForm />
        </Panel>
      </PageBody>
    </Page>
  );
}
