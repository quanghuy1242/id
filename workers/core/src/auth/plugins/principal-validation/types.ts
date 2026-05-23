import type { AdapterContext } from "../oauth-scope-catalog/types";

export type PrincipalValidationPluginOptions = {
  readonly issuer?: string;
  readonly audience?: string;
  readonly scope?: string;
};

export type PrincipalValidationAdapter = AdapterContext & {
  readonly findMany: <T>(query: {
    model: string;
    where?: { field: string; value: unknown }[];
  }) => Promise<T[]>;
};
