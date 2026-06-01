import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("UI route topology", () => {
  it("keeps hosted registration routes on the UI worker", () => {
    const wrangler = readFileSync("workers/ui/wrangler.jsonc", "utf8");

    expect(wrangler).toContain('"run_worker_first": ["/login*", "/register*"');
    expect(wrangler).toContain('"pattern": "id.quanghuy.dev/register*"');
  });
});
