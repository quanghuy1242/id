// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { GET } from "@/app/ui-health/route";

describe("Health route", () => {
  it("returns the UI worker health payload", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "id-ui" });
  });
});
