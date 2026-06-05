/** Adapter surface required by SCIM directory operations. */
export type ScimAdapter = {
  readonly findOne: <T>(query: {
    readonly model: string;
    readonly where: readonly {
      readonly field: string;
      readonly value: unknown;
    }[];
  }) => Promise<T | null>;
  readonly findMany: <T>(query: {
    readonly model: string;
    readonly where?: readonly {
      readonly field: string;
      readonly value: unknown;
    }[];
  }) => Promise<T[]>;
};

/** Plugin options injected from get-auth.ts. */
export type ScimDirectoryPluginOptions = {
  /**
   * JWT issuer. Defaults to the Better Auth base URL when omitted.
   * Injected from get-auth.ts; never hard-coded inside the plugin.
   */
  readonly issuer?: string;
  /** Expected audience for SCIM M2M bearer tokens. */
  readonly audience: string;
  /** Required scope in the SCIM M2M bearer token. Defaults to authPluginConfig.scimDirectoryScope. */
  readonly scope?: string;
};

/** Parsed SCIM filter for a single equality condition. */
export type ScimFilterClause = {
  readonly field: string;
  readonly op: "eq";
  readonly value: string;
};

/** Parsed SCIM filter — either a single clause or a compound AND of two clauses. */
export type ParsedScimFilter =
  | { readonly kind: "single"; readonly clause: ScimFilterClause }
  | {
      readonly kind: "and";
      readonly left: ScimFilterClause;
      readonly right: ScimFilterClause;
    };
