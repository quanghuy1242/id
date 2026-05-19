/** Core worker health endpoint path. */
export const CORE_HEALTH_PATH = "/health";

/** UI worker proxy prefix for core admin API calls. */
export const ADMIN_API_PROXY_PREFIX = "/admin/api";

export type HealthResponse = {
  readonly ok: boolean;
  readonly service: string;
};
