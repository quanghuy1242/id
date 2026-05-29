export type CoreEnv = {
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly BETTER_AUTH_COOKIE_DOMAIN?: string;
  readonly EMAIL_FROM?: string;
  readonly EMAIL_FROM_NAME?: string;
  readonly ID_BOOTSTRAP_TOKEN?: string;
  readonly RESEND_API_KEY?: string;
  readonly DB: D1Database;
  readonly KV: KVNamespace;
};
