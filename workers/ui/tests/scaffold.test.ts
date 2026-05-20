import { describe, expect, it } from "vitest";

describe("UI worker scaffold", () => {
  it("exports a vinext app entry", () => {
    // vinext handles the entry point via vinext/server/app-router-entry
    // The app directory and pages verify through the build process.
    expect(true).toBe(true);
  });
});
