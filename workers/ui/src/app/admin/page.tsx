// TODO: Admin sign-in has no MFA requirement. This is an IdP — add TOTP (Better Auth twoFactor plugin)
// enforced for admin role. Check in proxy.ts middleware after role=admin is confirmed.
// Also consider session freshness: re-auth if session age > 1h for admin routes.
import { PageBody, Panel, Stack } from "@id/ui";

export default function AdminPage() {
  return (
    <PageBody>
      <Stack>
        <Panel>Scaffold. Full admin UI deferred to later batch.</Panel>
      </Stack>
    </PageBody>
  );
}
