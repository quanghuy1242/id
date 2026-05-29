// Admin-login MFA is handled server-side by the id-admin-sign-in-guard plugin
// (per-login email OTP for /admin-context sign-ins). See docs/024_admin-login-context-guard.md;
// account-level TOTP and session-freshness re-auth are tracked there as future work.
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
