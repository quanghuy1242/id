export type CoreEnv = {
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly DB: D1Database;
  readonly KV: KVNamespace;
};
