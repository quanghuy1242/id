import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@/",
        replacement: fileURLToPath(new URL("./src/", import.meta.url)),
      },
      {
        find: "@id/ui",
        replacement: fileURLToPath(
          new URL("../../packages/ui/src/index.ts", import.meta.url),
        ),
      },
      {
        find: "@id/lib",
        replacement: fileURLToPath(
          new URL("../../packages/lib/src/index.ts", import.meta.url),
        ),
      },
      {
        find: "next/link",
        replacement: fileURLToPath(
          new URL("../../.ladle/mocks/next-link.tsx", import.meta.url),
        ),
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
  },
});
