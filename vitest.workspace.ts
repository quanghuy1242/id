import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "workers/core/vitest.config.ts",
  "workers/ui/vitest.config.ts",
]);
