import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { rememberContextSelection } from "../../authorization-context-selection";
import { isContinuePath } from "./operations";

/**
 * Captures the post-login authorization-context selection on the
 * `/oauth2/continue` request.
 *
 * The BA OAuth provider only runs `postLogin.shouldRedirect` (which can read
 * the `x-id-oauth-context` header) on the INITIAL authorize request, where no
 * selection exists yet — on the `/oauth2/continue` request that actually
 * carries the header it is skipped (`settings.postLogin` is set). As a result
 * the selection header was never read and `consentReferenceId` saw nothing,
 * failing every selection with "OAuth authorization context was not selected".
 *
 * This `hooks.before` matcher runs on the continue request — the same request,
 * and therefore the same isolate, in which `consentReferenceId` later runs — so
 * recording the selection in the in-isolate bridge keyed by session id gives a
 * reliable read-after-write the eventually-consistent KV path could not.
 */
export const idOAuthContextSelection = (): BetterAuthPlugin => ({
  id: "id-oauth-context-selection",
  hooks: {
    before: [
      {
        matcher: isContinuePath,
        handler: createAuthMiddleware(async (ctx) => {
          const selection = ctx.headers?.get("x-id-oauth-context");
          if (!selection) return;
          const session = await getSessionFromCtx(
            ctx as Parameters<typeof getSessionFromCtx>[0],
            { disableRefresh: true },
          ).catch(() => null);
          const sessionId = session?.session?.id;
          if (typeof sessionId === "string" && sessionId.length > 0) {
            rememberContextSelection(sessionId, selection, Date.now());
          }
        }),
      },
    ],
  },
});
