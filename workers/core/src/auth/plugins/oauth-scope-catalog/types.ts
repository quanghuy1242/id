export type AdapterContext = {
  readonly findOne: <T>(query: {
    model: string;
    where: { field: string; value: unknown }[];
  }) => Promise<T | null>;
  readonly findMany: <T>(query: {
    model: string;
    where?: { field: string; value: unknown }[];
    sortBy?: { field: string; direction: "asc" | "desc" };
  }) => Promise<T[]>;
  readonly create: <T>(query: {
    model: string;
    data: Record<string, unknown>;
  }) => Promise<T>;
  readonly update: <T>(query: {
    model: string;
    where: { field: string; value: unknown }[];
    update: Record<string, unknown>;
  }) => Promise<T>;
  readonly delete: (query: {
    model: string;
    where: { field: string; value: unknown }[];
  }) => Promise<void>;
};

export type OAuthScopeCatalogPluginOptions = {
  readonly authorize?: (
    organizationId: string | null | undefined,
    userId: string,
    role: string | null | undefined,
    adapter: unknown,
  ) => Promise<boolean>;
  readonly invalidateScopeCache?: () => Promise<void>;
  readonly invalidateGrantCache?: (clientId: string) => Promise<void>;
  readonly invalidateClientResourceScopeCache?: (clientId: string) => Promise<void>;
};
