import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { isPlatformStepUpFresh } from "../../config";
import { resolveConsoleScopeEnvelope, type ConsoleScopesAdapter } from "./operations";
import { consoleScopesEndpointMetadata } from "./schema";
import type { ConsoleScopesPluginOptions } from "./types";

export type { ConsoleScopesPluginOptions } from "./types";

/** Better Auth plugin that resolves console scope-selector data for the current session. */
export const idConsoleScopes = (options: ConsoleScopesPluginOptions = {}): BetterAuthPlugin => ({
  id: "id-console-scopes",
  endpoints: {
    getConsoleScopes: createAuthEndpoint(
      "/admin/console-scopes",
      {
        method: "GET",
        use: [sessionMiddleware],
        metadata: consoleScopesEndpointMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const platformStepUpAt = (session.session as { platformStepUpAt?: number | null }).platformStepUpAt;
        return ctx.json(await resolveConsoleScopeEnvelope({
          adapter: ctx.context.adapter as ConsoleScopesAdapter,
          user: {
            id: session.user.id,
            email: session.user.email,
            role: session.user.role,
          },
          isPlatformAdmin: options.isPlatformAdmin ?? (() => false),
          platformStepUpSatisfied: isPlatformStepUpFresh(platformStepUpAt ?? null),
        }));
      },
    ),
  },
});
