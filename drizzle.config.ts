import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./workers/core/src/db/auth-schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: ".wrangler/drizzle-local.db",
  },
});
