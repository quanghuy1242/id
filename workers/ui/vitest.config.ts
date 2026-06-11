import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const nodeModules = fileURLToPath(
  new URL("../../node_modules", import.meta.url),
);

// @idco/* are external dependencies; they resolve from node_modules (the
// published package, or the sibling checkout under `pnpm dev:link`) through the
// package `exports`, so no source alias is needed here.

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: [
      "lucide-react",
      "react",
      "react-aria",
      "react-aria-components",
      "react-dom",
      "react-stately",
    ],
    alias: [
      {
        find: "@/",
        replacement: fileURLToPath(new URL("./src/", import.meta.url)),
      },
      {
        find: "next/link",
        replacement: fileURLToPath(
          new URL("../../.ladle/mocks/next-link.tsx", import.meta.url),
        ),
      },
      {
        find: /^lucide-react$/,
        replacement: `${nodeModules}/lucide-react/dist/cjs/lucide-react.js`,
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: `${nodeModules}/react/jsx-dev-runtime.js`,
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: `${nodeModules}/react/jsx-runtime.js`,
      },
      {
        find: /^react$/,
        replacement: `${nodeModules}/react/index.js`,
      },
      {
        find: /^react-aria$/,
        replacement: `${nodeModules}/react-aria/dist/exports/index.mjs`,
      },
      {
        find: /^react-aria-components$/,
        replacement: `${nodeModules}/react-aria-components/dist/exports/index.mjs`,
      },
      {
        find: /^react-dom\/client$/,
        replacement: `${nodeModules}/react-dom/client.js`,
      },
      {
        find: /^react-dom$/,
        replacement: `${nodeModules}/react-dom/index.js`,
      },
      {
        find: /^react-stately$/,
        replacement: `${nodeModules}/react-stately/dist/exports/index.mjs`,
      },
    ],
  },
  test: {
    name: "ui",
    environment: "jsdom",
    include: ["tests/all.test.ts"],
    passWithNoTests: true,
    setupFiles: [`${rootDir}tests/setup.ts`],
    globals: true,
    // Inline the published @idco/* packages so Vite transforms them instead of
    // letting Node import their ESM output natively. This keeps Vitest aligned
    // with the vinext/Vite app build resolver while the committed dependency
    // graph still points at the registry packages.
    server: { deps: { inline: [/@quanghuy1242\/idco-/] } },
  },
});
