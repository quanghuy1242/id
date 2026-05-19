import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("oxlint architecture rules", () => {
  it("catches a layer-import violation (drizzle in domain)", () => {
    const fixture = "workers/core/tests/fixtures/layer-import-violation.ts";
    try {
      execSync(`pnpm oxlint --js-plugin scripts/oxlint-js-plugins/architecture.js -D correctness -D suspicious -D perf --rules architecture/layer-imports=error "${fixture}"`, {
        stdio: "pipe",
        encoding: "utf8",
      });
      expect.fail("oxlint should have reported an error");
    } catch (err) {
      expect(err.stdout).toContain("architecture/layer-imports");
    }
  });

  it("catches a worker-isolation violation (core importing from ui)", () => {
    const fixture = "workers/core/tests/fixtures/worker-isolation-violation.ts";
    try {
      execSync(`pnpm oxlint --js-plugin scripts/oxlint-js-plugins/architecture.js -D correctness -D suspicious -D perf --rules architecture/worker-isolation=error "${fixture}"`, {
        stdio: "pipe",
        encoding: "utf8",
      });
      expect.fail("oxlint should have reported an error");
    } catch (err) {
      expect(err.stdout).toContain("architecture/worker-isolation");
    }
  });

  it("catches a ui-route-composition violation (raw <div> in admin page)", () => {
    const fixture = "workers/ui/tests/fixtures/ui-route-composition-violation.tsx";
    try {
      execSync(`pnpm oxlint --js-plugin scripts/oxlint-js-plugins/architecture.js -D correctness -D suspicious -D perf --rules architecture/ui-route-composition=error "${fixture}"`, {
        stdio: "pipe",
        encoding: "utf8",
      });
      expect.fail("oxlint should have reported an error");
    } catch (err) {
      expect(err.stdout).toContain("architecture/ui-route-composition");
    }
  });

  it("passes cleanly on valid files", () => {
    execSync(`pnpm oxlint --js-plugin scripts/oxlint-js-plugins/architecture.js -D correctness -D suspicious -D perf workers/core/src/app.ts`, {
      stdio: "pipe",
      encoding: "utf8",
    });
  });
});
