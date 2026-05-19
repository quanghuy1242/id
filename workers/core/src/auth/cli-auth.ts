import { getAuth } from "./get-auth";
import type { BetterAuthOptions } from "better-auth";

type NodeSqliteModule = {
  readonly DatabaseSync: new (path: string) => unknown;
};

const sqliteModuleName = "node:sqlite";
const { DatabaseSync } = (await import(sqliteModuleName)) as NodeSqliteModule;

const cliEnv = {
  BETTER_AUTH_SECRET: crypto.randomUUID(),
  BETTER_AUTH_URL: "https://id.localhost",
  DB: new DatabaseSync(":memory:") as BetterAuthOptions["database"],
  KV: {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
  },
};

export const auth = getAuth(cliEnv);

export default auth;
