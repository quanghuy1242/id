export type ActivityAdapterWhere = {
  readonly field: string;
  readonly value: unknown;
  readonly operator?: "in";
};

export type ActivityAdapter = {
  readonly create: <T>(query: {
    model: string;
    data: Record<string, unknown>;
  }) => Promise<T>;
  readonly findMany: <T>(query: {
    model: string;
    where?: ActivityAdapterWhere[];
    limit?: number;
    offset?: number;
    sortBy?: { field: string; direction: "asc" | "desc" };
  }) => Promise<T[]>;
  readonly count: (query: {
    model: string;
    where?: ActivityAdapterWhere[];
  }) => Promise<number>;
};

export type ActivityRecordInput = {
  readonly actorId: string;
  readonly actorType?: "user" | "system";
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly scope?: "platform" | "organization" | null;
  readonly organizationId?: string | null;
  readonly actorPlatformRole?: string | null;
  readonly actorOrganizationRole?: "owner" | "admin" | null;
  readonly steppedUp?: boolean | null;
  readonly summary: string;
  readonly details: Record<string, unknown> | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly metadata?: Record<string, unknown> | null;
};

export type ActivityRecordDraft = Omit<
  ActivityRecordInput,
  "actorId" | "actorType"
>;

export type AdminActivityLogPluginOptions = {
  readonly authorize?: (
    organizationId: string | null | undefined,
    userId: string,
    role: string | null | undefined,
    adapter: unknown,
  ) => Promise<boolean>;
};
