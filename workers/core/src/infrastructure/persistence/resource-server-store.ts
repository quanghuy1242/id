import type { ResourceAudienceRow } from "../../auth/adapters/audiences";
import type { CoreEnv } from "../../config/env";

export type ResourceServerRecord = ResourceAudienceRow & {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly disabledAt: number | null;
  readonly disabledBy: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export async function listResourceServerRows(db: CoreEnv["DB"]): Promise<readonly ResourceServerRecord[]> {
  const result = await db
    .prepare(
      'select "id", "organizationId", "slug", "name", "audience", "description", "enabled", "createdBy", "updatedBy", "disabledAt", "disabledBy", "createdAt", "updatedAt" from "resourceServer" order by "createdAt" desc',
    )
    .all<ResourceServerRecord>();

  return result.results ?? [];
}

export async function loadEnabledResourceAudienceRows(db: CoreEnv["DB"]): Promise<readonly ResourceAudienceRow[]> {
  const result = await db
    .prepare('select "audience", "enabled" from "resourceServer" where "enabled" = ? order by "audience" asc')
    .bind(1)
    .all<ResourceAudienceRow>();

  return result.results ?? [];
}
