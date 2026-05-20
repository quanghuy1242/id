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
    organizationId: string,
    userId: string,
    role: string | null | undefined,
    adapter: unknown,
  ) => Promise<boolean>;
};
