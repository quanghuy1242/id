import { Page, Panel, Stack, Text } from "@idco/ui";
import { RegisterForm } from "../../register-form";

type InviteRegisterPageProps = {
  readonly params: {
    readonly invitationId: string;
  };
};

export default function InviteRegisterPage({ params }: InviteRegisterPageProps) {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Join workspace</Text>
          <RegisterForm invitationId={params.invitationId} />
        </Stack>
      </Panel>
    </Page>
  );
}
