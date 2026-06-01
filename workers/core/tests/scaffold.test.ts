import { describe, expect, it } from "vitest";
import { createApp } from "../src/composition/create-app";

describe("core scaffold", () => {
  it("creates a Hono app", () => {
    const app = createApp();
    expect(app).toBeDefined();
  });

  it("responds to health check", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("id-core");
  });

  it("redirects the root domain to account center", async () => {
    const app = createApp();
    const res = await app.request("/");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/account");
  });
});
