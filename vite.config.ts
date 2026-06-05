import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

const coreSrc = fileURLToPath(new URL("./workers/core/src", import.meta.url));

export default defineConfig({
  plugins: [
    cloudflare({
      configPath: "workers/core/wrangler.jsonc",
    }),
  ],
  resolve: {
    alias: [{ find: /^@\//, replacement: `${coreSrc}/` }],
  },
});
