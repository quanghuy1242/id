// Admin-login MFA is handled server-side by the id-admin-sign-in-guard plugin
// (per-login email OTP for /admin-context sign-ins). See docs/024_admin-login-context-guard.md;
// account-level TOTP and session-freshness re-auth are tracked there as future work.
import { PageBody } from "@id/ui";
import { DashboardContent } from "./_components/dashboard-content";

export default function AdminPage() {
  return (
    <PageBody>
      <DashboardContent />
    </PageBody>
  );
}
