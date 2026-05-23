// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { DIRECT_SHARE_VALUE, WORKSPACE_CONTEXT_PREFIX } from "@/shared/constants";

describe("constants", () => {
  it("exports DIRECT_SHARE_VALUE", () => {
    expect(DIRECT_SHARE_VALUE).toBe("direct-share");
  });

  it("exports WORKSPACE_CONTEXT_PREFIX", () => {
    expect(WORKSPACE_CONTEXT_PREFIX).toBe("workspace:");
  });
});
