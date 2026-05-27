import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const uiPackageSrc = fileURLToPath(new URL("../packages/ui/src", import.meta.url));
const libPackageSrc = fileURLToPath(new URL("../packages/lib/src", import.meta.url));
const uiWorkerSrc = fileURLToPath(new URL("../workers/ui/src", import.meta.url));
const nextLinkMock = fileURLToPath(new URL("./mocks/next-link.tsx", import.meta.url));
const nextNavigationMock = fileURLToPath(new URL("./mocks/next-navigation.ts", import.meta.url));

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      { find: "@id/ui", replacement: `${uiPackageSrc}/index.ts` },
      { find: "@id/lib", replacement: `${libPackageSrc}/index.ts` },
      { find: /^@\//, replacement: `${uiWorkerSrc}/` },
      { find: "next/link", replacement: nextLinkMock },
      { find: "next/navigation", replacement: nextNavigationMock },
    ],
  },
});
