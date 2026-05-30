import type { Story, StoryDefault } from "@ladle/react";
import { TokenIntrospectContent } from "../../workers/ui/src/app/admin/_components/security/token-introspect-content";
import type { TokenIntrospectionInput, TokenIntrospectionResult } from "../../workers/ui/src/app/admin/_actions/audit";
import { SecurityShell } from "../_decorators/security-shell";

export default { title: "Admin / Grants & Keys / Token Decoder" } satisfies StoryDefault;

const ACTIVE = "/admin/security/introspect";

const actions = {
  introspectToken: async (_input: TokenIntrospectionInput): Promise<TokenIntrospectionResult> => ({
    active: true,
    client_id: "cli_content",
    token_type: "Bearer",
    scope: "content:read",
    exp: 1_800_000_000,
  }),
};

export const Default: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <TokenIntrospectContent actions={actions} />
  </SecurityShell>
);
