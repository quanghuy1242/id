/**
 * Plugin integration types.
 *
 * Keep these separate from `schema.ts`: schema owns data shapes and generated
 * API metadata, while this file owns runtime hooks injected by `get-auth.ts`.
 * That separation keeps future custom plugins easy to lift into shared
 * templates without coupling persistence shape to composition callbacks.
 */

/** Minimal adapter surface needed for plugin-local uniqueness checks. */
export type AdapterContext = {
  readonly findMany: <T>(params: {
    model: string;
    where?: Array<{ field: string; value: unknown }>;
  }) => Promise<T[]>;
};

/** Options accepted by the `idResourceServer` BA plugin factory. */
export type ResourceServerPluginOptions = {
  /** Called after any mutation that changes the set of enabled audiences. */
  readonly invalidateAudienceCache?: () => Promise<void>;
  /**
   * Callback that determines whether the session user may read or mutate a
   * resource server in the given organization. Return `true` to permit the
   * operation.
   */
  readonly authorize?: (
    organizationId: string | null | undefined,
    userId: string,
    role: string | null | undefined,
    adapter: unknown,
  ) => Promise<boolean>;
};
