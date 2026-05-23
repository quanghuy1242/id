export type AdapterContext = {
  readonly findOne: <T>(query: {
    model: string;
    where: { field: string; value: unknown }[];
  }) => Promise<T | null>;
  readonly findMany: <T>(query: {
    model: string;
    where?: { field: string; value: unknown }[];
  }) => Promise<T[]>;
};

export type OAuthScopeCatalogPluginOptions = {
  readonly authorize?: (
    organizationId: string,
    userId: string,
    role: string | null | undefined,
    adapter: unknown,
  ) => Promise<boolean>;
  readonly invalidateScopeCache?: () => Promise<void>;
  readonly invalidateGrantCache?: (clientId: string) => Promise<void>;
};
