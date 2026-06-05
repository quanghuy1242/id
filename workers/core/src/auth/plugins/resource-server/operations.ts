import { APIError } from "better-auth/api";
import { RESOURCE_SERVER_MODEL } from "../../../shared/constants";
import type { AdapterContext, ResourceServerPluginOptions } from "./types";
import type {
  CreateResourceServerBody,
  UpdateResourceServerBody,
  ResourceServerRow,
} from "./schema";

/**
 * Operation helpers for the Better Auth resource-server plugin.
 *
 * These helpers are deliberately framework-light: no Hono imports, no Drizzle,
 * and no direct access-policy imports. Endpoint handlers pass adapter/session
 * data in, and `get-auth.ts` injects the actual authorization callback.
 */

export type AuthorizeFn = NonNullable<ResourceServerPluginOptions["authorize"]>;

/**
 * Calls the injected authorization callback.
 *
 * Throws FORBIDDEN when the callback is absent or returns `false`, indicating
 * the session user is not permitted to read or mutate resource servers in the
 * given organization.
 */
export async function assertResourceServerAccess(
  authorize: AuthorizeFn | undefined,
  organizationId: string | null | undefined,
  userId: string,
  role: string | null | undefined,
  adapter: unknown,
): Promise<void> {
  if (!authorize || !(await authorize(organizationId, userId, role, adapter))) {
    throw new APIError("FORBIDDEN");
  }
}

/**
 * Checks whether a session user can see a resource-server row.
 *
 * Returns `false` when the injected authorization callback is absent or denies
 * access. This is used by list/get endpoints to filter or hide rows.
 */
export async function canAccessResourceServer(
  authorize: AuthorizeFn | undefined,
  row: Pick<ResourceServerRow, "organizationId">,
  userId: string,
  role: string | null | undefined,
  adapter: unknown,
): Promise<boolean> {
  return Boolean(
    authorize && (await authorize(row.organizationId, userId, role, adapter)),
  );
}

/**
 * Ensures slug uniqueness inside one organization.
 *
 * Throws BAD_REQUEST when another resource server with the same slug already
 * exists in the organization. `ignoreId` allows updates to keep the current
 * row's slug.
 */
export async function assertUniqueSlug(
  adapter: AdapterContext,
  organizationId: string | null | undefined,
  slug: string,
  ignoreId?: string,
): Promise<void> {
  if (!organizationId) {
    const rows = await adapter.findMany<ResourceServerRow>({
      model: RESOURCE_SERVER_MODEL,
      where: [
        { field: "organizationId", value: null },
        { field: "slug", value: slug },
      ],
    });

    if (rows.some((row) => row.id !== ignoreId)) {
      throw new APIError("BAD_REQUEST", {
        message: "System resource server slug already exists",
      });
    }
    return;
  }

  const rows = await adapter.findMany<ResourceServerRow>({
    model: RESOURCE_SERVER_MODEL,
    where: [
      { field: "organizationId", value: organizationId },
      { field: "slug", value: slug },
    ],
  });

  if (rows.some((row) => row.id !== ignoreId)) {
    throw new APIError("BAD_REQUEST", {
      message: "Resource server slug already exists in organization",
    });
  }
}

export type EnsureResourceServerBody = Pick<
  CreateResourceServerBody,
  "organizationId" | "slug" | "name" | "audience" | "description"
>;

export type EnsureResourceServerResult = {
  readonly row: ResourceServerRow;
  readonly changed: boolean;
};

type ResourceServerUpdate = {
  -readonly [Key in keyof ResourceServerRow]?: ResourceServerRow[Key];
};

/**
 * Ensures a resource server exists for an audience using the same BA adapter
 * model and payload helpers as the endpoint path.
 */
export async function ensureResourceServerByAudience(
  adapter: AdapterContext,
  body: EnsureResourceServerBody,
  actorId: string,
): Promise<EnsureResourceServerResult> {
  const existing = await adapter.findOne<ResourceServerRow>({
    model: RESOURCE_SERVER_MODEL,
    where: [{ field: "audience", value: body.audience }],
  });

  if (!existing) {
    await assertUniqueSlug(adapter, body.organizationId, body.slug);
    const created = await adapter.create<ResourceServerRow>({
      model: RESOURCE_SERVER_MODEL,
      data: buildCreatePayload(body, actorId),
    });
    return { row: created, changed: true };
  }

  if (existing.slug !== body.slug) {
    await assertUniqueSlug(
      adapter,
      body.organizationId,
      body.slug,
      existing.id,
    );
  }

  const update: ResourceServerUpdate = {};
  const organizationId = body.organizationId ?? null;
  if ((existing.organizationId ?? null) !== organizationId)
    update.organizationId = organizationId;
  if (existing.slug !== body.slug) update.slug = body.slug;
  if (existing.name !== body.name) update.name = body.name;
  if (existing.audience !== body.audience) update.audience = body.audience;
  if (
    body.description !== undefined &&
    existing.description !== body.description
  ) {
    update.description = body.description;
  }
  if (!existing.enabled) {
    update.enabled = true;
    update.disabledAt = null;
    update.disabledBy = null;
  }

  if (Object.keys(update).length === 0) {
    return { row: existing, changed: false };
  }

  const row = await adapter.update<ResourceServerRow>({
    model: RESOURCE_SERVER_MODEL,
    where: [{ field: "id", value: existing.id }],
    update: {
      ...update,
      updatedBy: actorId,
      updatedAt: Date.now(),
    },
  });
  return { row, changed: true };
}

/**
 * Builds the insert payload for a new resource server.
 * Defaults `enabled` to `true`, stamps `createdAt`/`updatedAt`, and resolves
 * `createdBy` to the acting user.
 */
export function buildCreatePayload(
  body: CreateResourceServerBody,
  actorId: string,
): Omit<ResourceServerRow, "id"> {
  const now = Date.now();
  return {
    ...body,
    enabled: true,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Builds the partial update payload for a resource server patch.
 * Always stamps `updatedBy` and `updatedAt`.
 */
export function buildUpdatePayload(
  fields: UpdateResourceServerBody,
  actorId: string,
): Partial<ResourceServerRow> {
  return {
    ...fields,
    updatedBy: actorId,
    updatedAt: Date.now(),
  } as Partial<ResourceServerRow>;
}

/**
 * Builds the update payload for disabling a resource server.
 * Sets `enabled: false` and stamps `disabledBy`/`disabledAt`.
 */
export function buildDisablePayload(
  actorId: string,
): Partial<ResourceServerRow> {
  const now = Date.now();
  return {
    enabled: false,
    disabledBy: actorId,
    disabledAt: now,
    updatedBy: actorId,
    updatedAt: now,
  };
}

/**
 * Builds the update payload for re-enabling a resource server.
 * Clears disable metadata so the row describes its current active state.
 */
export function buildEnablePayload(
  actorId: string,
): Partial<ResourceServerRow> {
  return {
    enabled: true,
    disabledBy: null,
    disabledAt: null,
    updatedBy: actorId,
    updatedAt: Date.now(),
  };
}
