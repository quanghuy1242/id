// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { ConsoleScope } from "@id/lib";
import {
  CONSOLE_NAV_ITEMS,
  DIRECT_SHARE_VALUE,
  WORKSPACE_CONTEXT_PREFIX,
  visibleNavItems,
  visibleNavSections,
} from "@/shared/constants";

describe("constants", () => {
  it("exports DIRECT_SHARE_VALUE", () => {
    expect(DIRECT_SHARE_VALUE).toBe("direct-share");
  });

  it("exports WORKSPACE_CONTEXT_PREFIX", () => {
    expect(WORKSPACE_CONTEXT_PREFIX).toBe("workspace:");
  });

  it("filters the platform lens from the single console navigation definition", () => {
    const scope: ConsoleScope = {
      kind: "platform",
      id: "platform",
      label: "Platform",
      role: "platform-admin",
      permissions: [
        "platform:read",
        "organizations:read",
        "oauth-clients:read",
        "resource-servers:read",
        "security-audit:read",
        "jwks:read",
        "system:read",
      ],
      requiresStepUp: true,
    };

    const visible = visibleNavItems(CONSOLE_NAV_ITEMS, scope);

    expect(visible.map((item) => item.id)).toContain("identity-users");
    expect(visible.map((item) => item.id)).toContain("identity-organizations");
    expect(visible.map((item) => item.id)).toContain("security-jwks");
    expect(visible.map((item) => item.id)).not.toContain("system-health");
    expect(visible.map((item) => item.id)).not.toContain("identity-teams");
  });

  it("filters the organization lens without platform-only items or empty sections", () => {
    const scope: ConsoleScope = {
      kind: "organization",
      id: "organization:org_123",
      organizationId: "org_123",
      label: "Acme",
      role: "admin",
      permissions: [
        "members:read",
        "members:write",
        "oauth-clients:read",
        "resource-servers:read",
        "security-audit:read",
      ],
      requiresStepUp: false,
    };

    const visible = visibleNavItems(CONSOLE_NAV_ITEMS, scope);
    const sections = visibleNavSections(scope);

    expect(visible.find((item) => item.id === "identity-users")).toMatchObject({
      label: "Members",
      href: "/admin/orgs/org_123/identity/members",
    });
    expect(visible.map((item) => item.id)).toContain("identity-teams");
    expect(visible.map((item) => item.id)).toContain("access-resource-apis");
    expect(visible.map((item) => item.id)).not.toContain("identity-organizations");
    expect(visible.map((item) => item.id)).not.toContain("security-jwks");
    expect(sections.every((section) => section.items.length > 0)).toBe(true);
  });

  it("omits items when their permission is absent", () => {
    const scope: ConsoleScope = {
      kind: "organization",
      id: "organization:org_123",
      organizationId: "org_123",
      label: "Acme",
      role: "admin",
      permissions: ["members:read"],
      requiresStepUp: false,
    };

    expect(visibleNavItems(CONSOLE_NAV_ITEMS, scope).map((item) => item.id)).toEqual([
      "dashboard",
      "identity-users",
      "identity-teams",
    ]);
  });
});
