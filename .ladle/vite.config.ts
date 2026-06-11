import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// @idco/* resolve from node_modules (published package, or sibling checkout
// under `pnpm dev:link`) through the package `exports`; no source alias needed.
const uiWorkerSrc = fileURLToPath(new URL("../workers/ui/src", import.meta.url));
const nextLinkMock = fileURLToPath(new URL("./mocks/next-link.tsx", import.meta.url));
const nextNavigationMock = fileURLToPath(new URL("./mocks/next-navigation.ts", import.meta.url));
const nodeModules = fileURLToPath(new URL("../node_modules", import.meta.url));

export default defineConfig({
  plugins: [tailwindcss()],
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
      { find: /^@\//, replacement: `${uiWorkerSrc}/` },
      { find: /^lucide-react$/, replacement: `${nodeModules}/lucide-react/dist/cjs/lucide-react.js` },
      { find: "next/link", replacement: nextLinkMock },
      { find: "next/navigation", replacement: nextNavigationMock },
      { find: /^react\/jsx-dev-runtime$/, replacement: `${nodeModules}/react/jsx-dev-runtime.js` },
      { find: /^react\/jsx-runtime$/, replacement: `${nodeModules}/react/jsx-runtime.js` },
      { find: /^react$/, replacement: `${nodeModules}/react/index.js` },
      { find: /^react-aria$/, replacement: `${nodeModules}/react-aria/dist/exports/index.mjs` },
      {
        find: /^react-aria-components$/,
        replacement: `${nodeModules}/react-aria-components/dist/exports/index.mjs`,
      },
      { find: /^react-dom\/client$/, replacement: `${nodeModules}/react-dom/client.js` },
      { find: /^react-dom$/, replacement: `${nodeModules}/react-dom/index.js` },
      { find: /^react-stately$/, replacement: `${nodeModules}/react-stately/dist/exports/index.mjs` },
    ],
  },
});
