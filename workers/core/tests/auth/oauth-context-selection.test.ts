import { describe, expect, it } from "vitest";
import { idOAuthContextSelection } from "../../src/auth/plugins/oauth-context-selection";

type Matcher = (ctx: { readonly path?: string }) => boolean;

function continueMatcher(): Matcher {
  const plugin = idOAuthContextSelection();
  const hook = plugin.hooks?.before?.[0];
  if (!hook) throw new Error("expected a before hook");
  return hook.matcher as Matcher;
}

describe("oauth-context-selection plugin", () => {
  it("registers under a stable id", () => {
    expect(idOAuthContextSelection().id).toBe("id-oauth-context-selection");
  });

  it("matches the continue paths (and base/prefixed variants)", () => {
    const matcher = continueMatcher();
    expect(matcher({ path: "/oauth2/continue" })).toBe(true);
    expect(matcher({ path: "/api/auth/oauth2/continue" })).toBe(true);
    expect(matcher({ path: "/oauth2/admin/continue" })).toBe(true);
    expect(matcher({ path: "/admin/oauth2/continue" })).toBe(true);
  });

  it("does not match unrelated oauth paths", () => {
    const matcher = continueMatcher();
    expect(matcher({ path: "/oauth2/authorize" })).toBe(false);
    expect(matcher({ path: "/oauth2/token" })).toBe(false);
    expect(matcher({ path: "/oauth2/create-client" })).toBe(false);
    expect(matcher({})).toBe(false);
  });
});
