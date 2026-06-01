import type {
  ACCOUNT_MODEL,
  MEMBER_MODEL,
  OAUTH_CLIENT_MODEL,
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
  ORGANIZATION_MODEL,
  REGISTRATION_INTENT_MODEL,
  REGISTRATION_POLICY_MODEL,
  REGISTRATION_QUOTA_RESERVATION_MODEL,
  RESOURCE_SERVER_MODEL,
  TEAM_MEMBER_MODEL,
  USER_MODEL,
} from "../../../shared/constants";

type ModelName =
  | typeof ACCOUNT_MODEL
  | typeof MEMBER_MODEL
  | typeof OAUTH_CLIENT_MODEL
  | typeof OAUTH_CLIENT_RESOURCE_SCOPE_MODEL
  | typeof OAUTH_RESOURCE_SCOPE_MODEL
  | typeof ORGANIZATION_MODEL
  | typeof REGISTRATION_INTENT_MODEL
  | typeof REGISTRATION_POLICY_MODEL
  | typeof REGISTRATION_QUOTA_RESERVATION_MODEL
  | typeof RESOURCE_SERVER_MODEL
  | typeof TEAM_MEMBER_MODEL
  | typeof USER_MODEL;

type AdapterWhere = {
  readonly field: string;
  readonly value: unknown;
  readonly operator?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "contains" | "starts_with" | "ends_with";
};

export type RegistrationAdapter = {
  readonly findOne: <T>(args: { readonly model: ModelName; readonly where: readonly AdapterWhere[] }) => Promise<T | null>;
  readonly findMany: <T>(args: {
    readonly model: ModelName;
    readonly where?: readonly AdapterWhere[];
    readonly sortBy?: { readonly field: string; readonly direction: "asc" | "desc" };
  }) => Promise<T[]>;
  readonly create: <T>(args: { readonly model: ModelName; readonly data: Record<string, unknown> }) => Promise<T>;
  readonly update: <T>(args: {
    readonly model: ModelName;
    readonly where: readonly AdapterWhere[];
    readonly update: Record<string, unknown>;
  }) => Promise<T>;
  readonly delete: (args: { readonly model: ModelName; readonly where: readonly AdapterWhere[] }) => Promise<void>;
};

export type RegistrationAuthorize = (
  organizationId: string | null | undefined,
  userId: string,
  role: unknown,
  adapter: RegistrationAdapter,
) => boolean | Promise<boolean>;

export type RegistrationPluginOptions = {
  readonly authorize?: RegistrationAuthorize;
  readonly intentTtlMs?: number;
};
