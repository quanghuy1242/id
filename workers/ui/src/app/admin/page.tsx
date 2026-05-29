// Admin-login MFA is handled server-side by the id-admin-sign-in-guard plugin
// (per-login email OTP for /admin-context sign-ins). See docs/024_admin-login-context-guard.md;
// account-level TOTP and session-freshness re-auth are tracked there as future work.
import { Grid, LinkButton, PageBody, PageIntro, Panel, Stack, Text } from "@id/ui";

const sections = [
  { href: "/admin/identity/users", title: "Users", body: "Create accounts, assign roles, verify emails, and manage bans." },
  { href: "/admin/identity/organizations", title: "Organizations", body: "Manage tenants, their members, teams, and invitations." },
  { href: "/admin/oauth/applications", title: "OAuth Applications", body: "Register clients, manage secrets, scopes, and redirect URIs." },
  { href: "/admin/oauth/sessions-tokens", title: "Sessions & Tokens", body: "Audit active sign-ins and issued tokens; revoke what looks off." },
  { href: "/admin/security/jwks", title: "Signing Keys", body: "Inspect the public JWKS used to verify issued tokens." },
  { href: "/admin/security/consents", title: "Consents", body: "Review and revoke the apps users have authorized." },
];

export default function AdminPage() {
  return (
    <PageBody>
      <Stack gap="lg">
        <PageIntro
          title="Admin Console"
          description="Manage identities, organizations, OAuth clients, and the security surface of this identity provider."
          info="This console is the control plane for your identity provider. Use the sidebar (or the shortcuts below) to manage who can sign in, the tenants they belong to, the applications that integrate over OAuth/OIDC, and the keys, sessions, and consents that secure it all."
        />
        <Grid columns="three" gap="md">
          {sections.map((s) => (
            <Panel key={s.href}>
              <Stack gap="sm">
                <Text variant="h3">{s.title}</Text>
                <Text variant="caption">{s.body}</Text>
                <LinkButton href={s.href} variant="secondary" size="sm">Open</LinkButton>
              </Stack>
            </Panel>
          ))}
        </Grid>
      </Stack>
    </PageBody>
  );
}
