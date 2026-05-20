import { APIError } from "better-auth/api";
import { RESOURCE_SERVER_MODEL } from "../../../shared/constants";
import type { CreateResourceServerBody, UpdateResourceServerBody } from "./validation";
import type { AdapterContext, ResourceServerPluginOptions } from "./types";

/** Shape of a row returned by the Better Auth adapter for the `resourceServer` model. */
export type ResourceServerRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly audience: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly disabledAt?: number;
  readonly disabledBy?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};

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
  organizationId: string,
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
  return Boolean(authorize && (await authorize(row.organizationId, userId, role, adapter)));
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
  organizationId: string,
  slug: string,
  ignoreId?: string,
): Promise<void> {
  const rows = await adapter.findMany<ResourceServerRow>({
    model: RESOURCE_SERVER_MODEL,
    where: [
      { field: "organizationId", value: organizationId },
      { field: "slug", value: slug },
    ],
  });

  if (rows.some((row) => row.id !== ignoreId)) {
    throw new APIError("BAD_REQUEST", { message: "Resource server slug already exists in organization" });
  }
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
export function buildDisablePayload(actorId: string): Partial<ResourceServerRow> {
  const now = Date.now();
  return {
    enabled: false,
    disabledBy: actorId,
    disabledAt: now,
    updatedBy: actorId,
    updatedAt: now,
  };
}
