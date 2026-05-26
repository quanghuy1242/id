/**
 * Adapter and row types used by the OAuth M2M bridge plugin's `hooks.before`
 * guard. Kept in this file so the architecture/auth-plugin-folder-shape linter
 * is satisfied and so the inline handler in `index.ts` stays small.
 */
export type OAuthM2MBridgeAdapter = {
  readonly findOne: <T>(query: {
    model: string;
    where: { field: string; value: unknown }[];
  }) => Promise<T | null>;
};

export type OAuthClientRow = {
  readonly id: string;
  readonly clientId: string;
  readonly referenceId?: string | null;
  readonly disabled?: boolean | null;
  readonly grantTypes?: readonly string[] | string | null;
};
