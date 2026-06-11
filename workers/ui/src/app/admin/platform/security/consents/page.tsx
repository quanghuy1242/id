import { PageBody } from "@idco/ui";
import { ConsentsContent } from "../../../_components/security/consents-content";

export default function PlatformSecurityConsentsPage() {
  return (
    <PageBody>
      <ConsentsContent scope={{ kind: "platform" }} />
    </PageBody>
  );
}
