import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["workers/core", "workers/ui"],
  },
});
