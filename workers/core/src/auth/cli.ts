import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getAuthOptions } from "./get-auth";
import { betterAuth } from "better-auth";
import type {
  D1Database,
  D1DatabaseSession,
  D1ExecResult,
  D1PreparedStatement,
  D1Result,
} from "@cloudflare/workers-types";
import * as authSchema from "../db/auth-schema";

const unavailable = () => {
  throw new Error("D1 binding is unavailable in the Better Auth CLI config");
};

const stubDb: D1Database = {
  prepare(_query: string): D1PreparedStatement {
    return unavailable();
  },
  batch<T = unknown>(_statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return unavailable();
  },
  exec(_query: string): Promise<D1ExecResult> {
    return unavailable();
  },
  withSession(): D1DatabaseSession {
    return unavailable();
  },
  dump(): Promise<ArrayBuffer> {
    return unavailable();
  },
};

const options = getAuthOptions({
  BETTER_AUTH_SECRET: crypto.randomUUID(),
  BETTER_AUTH_URL: "https://id.localhost",
  DB: drizzleAdapter(stubDb, { provider: "sqlite", camelCase: true, schema: authSchema }),
  KV: {
    get: async (_key: string): Promise<null> => null,
    put: async (_key: string, _value: string): Promise<void> => {},
    delete: async (_key: string): Promise<void> => {},
  },
});

export default betterAuth(options);
