import { describe, expect, it } from "vitest";
import { CONTEXT_SELECTION_CACHE_TTL_MS } from "../../src/auth/config";
import {
  recallContextSelection,
  rememberContextSelection,
} from "../../src/auth/authorization-context-selection";

describe("authorization-context-selection bridge", () => {
  it("reads back the selection written for the same session (read-after-write)", () => {
    const now = 1_000_000;
    rememberContextSelection("session-rw", "workspace:org-123", now);
    expect(recallContextSelection("session-rw", now)).toBe("workspace:org-123");
  });

  it("isolates selections by session id", () => {
    const now = 2_000_000;
    rememberContextSelection("session-a", "direct-share", now);
    rememberContextSelection("session-b", "workspace:org-b", now);
    expect(recallContextSelection("session-a", now)).toBe("direct-share");
    expect(recallContextSelection("session-b", now)).toBe("workspace:org-b");
  });

  it("returns undefined for an unknown session", () => {
    expect(
      recallContextSelection("session-missing", 3_000_000),
    ).toBeUndefined();
  });

  it("expires entries older than the TTL", () => {
    const now = 4_000_000;
    rememberContextSelection("session-stale", "workspace:org-x", now);
    expect(
      recallContextSelection(
        "session-stale",
        now + CONTEXT_SELECTION_CACHE_TTL_MS + 1,
      ),
    ).toBeUndefined();
  });

  it("overwrites a prior selection for the same session (last write wins)", () => {
    const now = 5_000_000;
    rememberContextSelection("session-ow", "workspace:org-old", now);
    rememberContextSelection("session-ow", "direct-share", now + 10);
    expect(recallContextSelection("session-ow", now + 20)).toBe("direct-share");
  });
});
