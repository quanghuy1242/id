/** Options accepted by the `idResourceServer` BA plugin factory. */
export type ResourceServerPluginOptions = {
  /** Called after any mutation that changes the set of enabled audiences. */
  readonly invalidateAudienceCache?: () => Promise<void>;
  /**
   * Callback that determines whether the session user may mutate a resource
   * server in the given organization. The plugin calls it before every
   * mutation endpoint. Return `true` to permit the operation.
   */
  readonly authorize?: (
    organizationId: string,
    userId: string,
    platformRole: string | null | undefined,
    adapter: unknown,
  ) => Promise<boolean>;
};
