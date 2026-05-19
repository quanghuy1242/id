/** Core worker health endpoint path. */
export const CORE_HEALTH_PATH = "/health";

/** Core worker admin dashboard summary endpoint path. */
export const ADMIN_DASHBOARD_PATH = "/api/admin/dashboard";

export type HealthResponse = {
  readonly ok: boolean;
  readonly service: string;
};

export type AdminDashboardSummary = {
  readonly users: number;
  readonly organizations: number;
  readonly oauthClients: number;
  readonly resourceServers: number;
};
