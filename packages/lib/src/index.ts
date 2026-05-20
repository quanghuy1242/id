export * from "./constants";
export * from "./auth-fetch";

/** Core worker health endpoint path. */
export const CORE_HEALTH_PATH = "/health";

export type HealthResponse = {
  readonly ok: boolean;
  readonly service: string;
};
