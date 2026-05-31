import { execFile } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

const WORKSPACE = ".architecture-rule-workspace";

afterAll(() => {
  rmSync(WORKSPACE, { force: true, recursive: true });
});

function writeFixture(testDir: string, relPath: string, content: string): string {
  const full = `${WORKSPACE}/${testDir}/${relPath}`;
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function runOxlint(path: string): Promise<{ readonly status: number; readonly output: string }> {
  return new Promise((resolve) => {
    execFile(
      "node_modules/.bin/oxlint",
      ["--no-ignore", "-c", ".oxlintrc.json", path],
      { encoding: "utf8" },
      (err, stdout, stderr) => {
        resolve({ status: err ? ((err as { code?: number }).code ?? 1) : 0, output: stdout + stderr });
      },
    );
  });
}

describe.concurrent("oxlint architecture rules", () => {
  it("catches a layer-import violation (drizzle in domain)", async () => {
    const fixture = writeFixture(
      "layer-import",
      "workers/core/src/domain/layer-import-violation.ts",
      `import { sql } from "drizzle-orm";\nexport const value = sql;\n`,
    );
    const result = await runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("architecture(layer-imports)");
  });

  it("catches a worker-isolation violation (core importing from ui)", async () => {
    const fixture = writeFixture(
      "worker-isolation",
      "workers/core/src/app/worker-isolation-violation.ts",
      `import "../../../ui/src/main";\nexport const value = true;\n`,
    );
    const result = await runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("architecture(worker-isolation)");
  });

  it("catches a ui-route-composition violation (raw <div> in admin page)", async () => {
    const fixture = writeFixture(
      "ui-route-div",
      "workers/ui/src/app/admin/page.tsx",
      `export default function Page() {\n  return <div className="flex">bad</div>;\n}\n`,
    );
    const result = await runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("architecture(ui-route-composition)");
  });

  it("catches fetch in ui admin route files", async () => {
    const fixture = writeFixture(
      "ui-route-fetch",
      "workers/ui/src/app/admin/fetch/page.tsx",
      `import { Page } from "@id/ui";\nexport default async function PageFile() {\n  await fetch("/api/admin/dashboard");\n  return <Page>bad</Page>;\n}\n`,
    );
    const result = await runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("architecture(ui-route-composition)");
  });

  it("catches ui imports from core worker source", async () => {
    const fixture = writeFixture(
      "ui-core-import",
      "workers/ui/src/app/admin/core-import/page.tsx",
      `import "../../../../core/src/main";\nimport { Page } from "@id/ui";\nexport default function PageFile() {\n  return <Page>bad</Page>;\n}\n`,
    );
    const result = await runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("architecture(worker-isolation)");
  });

  it("catches auth dependencies in ui source", async () => {
    const fixture = writeFixture(
      "ui-auth-dep",
      "workers/ui/src/app/admin/auth-import/page.tsx",
      `import { betterAuth } from "better-auth";\nimport { Page } from "@id/ui";\nexport default function PageFile() {\n  betterAuth;\n  return <Page>bad</Page>;\n}\n`,
    );
    const result = await runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("architecture(ui-no-auth-deps)");
  });

  it("catches magic numbers in auth source", async () => {
    const fixture = writeFixture(
      "auth-magic-number",
      "workers/core/src/auth/adapters/magic-number.ts",
      `export const settings = { ttlSeconds: 300 };\n`,
    );
    const result = await runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("architecture(no-magic-numbers)");
  });

  it("allows documented constants in auth config", async () => {
    const fixture = writeFixture(
      "auth-config-constant",
      "workers/core/src/auth/config.ts",
      `/** Auth timeout for the fixture. */\nexport const AUTH_TIMEOUT_SECONDS = 300;\nexport const settings = { ttlSeconds: AUTH_TIMEOUT_SECONDS };\n`,
    );
    const result = await runOxlint(fixture);
    expect(result.status).toBe(0);
  });

  it("passes cleanly on valid files", async () => {
    const result = await runOxlint("workers/core/src/composition/create-app.ts");
    expect(result.status).toBe(0);
  });

  it("passes cleanly on valid ui composition files", async () => {
    const result = await runOxlint("workers/ui/src/app/admin/platform/page.tsx");
    expect(result.status).toBe(0);
  });
});
