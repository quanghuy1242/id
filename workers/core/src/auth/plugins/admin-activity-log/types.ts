export type ActivityAdapterWhere = {
  readonly field: string;
  readonly value: unknown;
  readonly operator?: "in";
};

export type ActivityAdapter = {
  readonly create: <T>(query: { model: string; data: Record<string, unknown> }) => Promise<T>;
  readonly findMany: <T>(query: {
    model: string;
    where?: ActivityAdapterWhere[];
    limit?: number;
    offset?: number;
    sortBy?: { field: string; direction: "asc" | "desc" };
  }) => Promise<T[]>;
  readonly count: (query: { model: string; where?: ActivityAdapterWhere[] }) => Promise<number>;
};

export type ActivityRecordInput = {
  readonly actorId: string;
  readonly actorType?: "user" | "system";
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly metadata?: Record<string, unknown> | null;
};

export type ActivityRecordDraft = Omit<ActivityRecordInput, "actorId" | "actorType">;

export type AdminActivityLogPluginOptions = {
  readonly authorize?: (role: string | null | undefined) => boolean;
};
