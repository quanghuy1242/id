import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const WORKSPACE = ".architecture-rule-workspace";

beforeEach(() => {
  rmSync(WORKSPACE, { force: true, recursive: true });
});

afterAll(() => {
  rmSync(WORKSPACE, { force: true, recursive: true });
});

function writeFixture(path: string, content: string) {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function runOxlint(path: string) {
  return spawnSync("pnpm", ["oxlint", "--no-ignore", "-c", ".oxlintrc.json", path], {
    encoding: "utf8",
  });
}

describe("oxlint architecture rules", () => {
  it("catches a layer-import violation (drizzle in domain)", () => {
    const fixture = writeFixture(
      `${WORKSPACE}/workers/core/src/domain/layer-import-violation.ts`,
      `import { sql } from "drizzle-orm";\nexport const value = sql;\n`,
    );
    const result = runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("architecture(layer-imports)");
  });

  it("catches a worker-isolation violation (core importing from ui)", () => {
    const fixture = writeFixture(
      `${WORKSPACE}/workers/core/src/app/worker-isolation-violation.ts`,
      `import "../../../ui/src/main";\nexport const value = true;\n`,
    );
    const result = runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("architecture(worker-isolation)");
  });

  it("catches a ui-route-composition violation (raw <div> in admin page)", () => {
    const fixture = writeFixture(
      `${WORKSPACE}/workers/ui/src/app/admin/page.tsx`,
      `export default function Page() {\n  return <div className="flex">bad</div>;\n}\n`,
    );
    const result = runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("architecture(ui-route-composition)");
  });

  it("catches fetch in ui admin route files", () => {
    const fixture = writeFixture(
      `${WORKSPACE}/workers/ui/src/app/admin/fetch/page.tsx`,
      `import { Page } from "@id/ui";\nexport default async function PageFile() {\n  await fetch("/api/admin/dashboard");\n  return <Page>bad</Page>;\n}\n`,
    );
    const result = runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("architecture(ui-route-composition)");
  });

  it("catches ui imports from core worker source", () => {
    const fixture = writeFixture(
      `${WORKSPACE}/workers/ui/src/app/admin/core-import/page.tsx`,
      `import "../../../../core/src/main";\nimport { Page } from "@id/ui";\nexport default function PageFile() {\n  return <Page>bad</Page>;\n}\n`,
    );
    const result = runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("architecture(worker-isolation)");
  });

  it("catches auth dependencies in ui source", () => {
    const fixture = writeFixture(
      `${WORKSPACE}/workers/ui/src/app/admin/auth-import/page.tsx`,
      `import { betterAuth } from "better-auth";\nimport { Page } from "@id/ui";\nexport default function PageFile() {\n  betterAuth;\n  return <Page>bad</Page>;\n}\n`,
    );
    const result = runOxlint(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("architecture(ui-no-auth-deps)");
  });

  it("passes cleanly on valid files", () => {
    const result = runOxlint("workers/core/src/composition/create-app.ts");
    expect(result.status).toBe(0);
  });

  it("passes cleanly on valid ui composition files", () => {
    const result = runOxlint("workers/ui/src/app/admin/page.tsx");
    expect(result.status).toBe(0);
  });
});
