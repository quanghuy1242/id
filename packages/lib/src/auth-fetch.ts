/**
 * Internal: serialises a flat params record into a URL query string.
 * undefined / "" values are omitted.
 */
function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Internal: performs a GET request against a Better Auth endpoint.
 *
 * The caller receives the raw {@link Response} so the two public GET
 * variants can decide whether to throw or swallow HTTP errors.
 *
 * @param path    — path relative to `/api/auth` (e.g. `"/admin/list-users"`)
 * @param params  — optional flat key/value map serialised as query string
 * @param init    — optional `RequestInit` overrides (headers are merged)
 */
async function apiGetFetch(path: string, params?: Record<string, string | number | undefined>, init?: RequestInit): Promise<Response> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  return fetch(`/api/auth${path}${buildQuery(params)}`, {
    ...restInit,
    headers: { accept: "application/json", ...initHeaders },
  });
}

/**
 * Internal: performs a POST request against a Better Auth endpoint.
 *
 * The caller receives the raw {@link Response} so the two public POST
 * variants can decide whether to throw or swallow HTTP errors.
 *
 * @param path  — path relative to `/api/auth` (e.g. `"/admin/create-user"`)
 * @param body  — optional JSON-serialisable request body
 * @param init  — optional `RequestInit` overrides (headers are merged)
 */
async function apiPostFetch(path: string, body: unknown | undefined, init: RequestInit | undefined): Promise<Response> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  return fetch(`/api/auth${path}`, {
    ...restInit,
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...initHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Internal: performs an OAuth-style form POST against a Better Auth endpoint.
 *
 * Use this for protocol endpoints such as token introspection where the wire
 * format is `application/x-www-form-urlencoded`, not JSON.
 */
async function apiFormPostFetch(path: string, body: URLSearchParams, init: RequestInit | undefined): Promise<Response> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  return fetch(`/api/auth${path}`, {
    ...restInit,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...initHeaders },
    body,
  });
}

/**
 * Internal: performs a request with an arbitrary JSON body method (PATCH/DELETE).
 *
 * Only the OAuth2 client-management and OAuth plugin admin endpoints
 * (`/admin/resource-servers/*`, `/admin/oauth-scopes/*`,
 * `/admin/oauth-client-resource-scopes/*`) use REST verbs; Better Auth's
 * admin/organization endpoints are POST-only (see {@link authApiPostOrThrow}).
 *
 * @param method — `"PATCH"` or `"DELETE"`
 * @param path   — path relative to `/api/auth` (e.g. `"/admin/resource-servers/abc"`)
 * @param body   — optional JSON-serialisable request body
 * @param init   — optional `RequestInit` overrides (headers are merged)
 */
async function apiBodyFetch(method: "PATCH" | "DELETE", path: string, body: unknown | undefined, init: RequestInit | undefined): Promise<Response> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  return fetch(`/api/auth${path}`, {
    ...restInit,
    method,
    headers: { "content-type": "application/json", accept: "application/json", ...initHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Public GET helpers ───────────────────────────────────────────

/**
 * GET a Better Auth endpoint and return JSON without throwing on HTTP errors.
 *
 * Use for login / consent / OAuth flows where a non-2xx response carries
 * flow-specific payloads the caller inspects (e.g. `admin_otp_required`,
 * `message`, `redirect_uri`).
 *
 * JSON parse failures are swallowed; the caller receives `{}`.
 *
 * @param path    — path relative to `/api/auth` (e.g. `"/get-session"`)
 * @param params  — optional flat key/value map serialised as query string
 * @param init    — optional `RequestInit` overrides (e.g. `credentials: "include"`)
 */
export async function authApiGet<T>(path: string, params?: Record<string, string | number | undefined>, init?: RequestInit): Promise<T> {
  const res = await apiGetFetch(path, params, init);
  return (await res.json().catch(() => ({}))) as T;
}

/**
 * GET a Better Auth endpoint and throw `new Error(body)` on !ok.
 *
 * Use for admin / organisation data-fetching where every non-2xx is a
 * hard error that the caller should not need to inspect.
 *
 * @param path    — path relative to `/api/auth` (e.g. `"/admin/list-users"`)
 * @param params  — optional flat key/value map serialised as query string
 * @param init    — optional `RequestInit` overrides
 */
export async function authApiGetOrThrow<T>(path: string, params?: Record<string, string | number | undefined>, init?: RequestInit): Promise<T> {
  const res = await apiGetFetch(path, params, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

// ─── Public POST helpers ──────────────────────────────────────────

/**
 * POST a Better Auth endpoint and return JSON without throwing on HTTP errors.
 *
 * Use for login / consent / OAuth flows where a non-2xx response carries
 * flow-specific payloads the caller inspects (e.g. `admin_otp_required`,
 * `message`, `redirect_uri`).
 *
 * JSON parse failures are swallowed; the caller receives `{}`.
 *
 * @param path  — path relative to `/api/auth` (e.g. `"/sign-in/email"`)
 * @param body  — optional JSON-serialisable request body
 * @param init  — optional `RequestInit` overrides (e.g. `{ headers: { "x-id-oauth-context": "..." } }`)
 */
export async function authApiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await apiPostFetch(path, body, init);
  return (await res.json().catch(() => ({}))) as T;
}

/**
 * POST a Better Auth endpoint and throw `new Error(body)` on !ok.
 *
 * Use for **all admin UI mutations** (create, update, delete, set-role,
 * ban, revoke, impersonate, etc.).  Better Auth uses `POST` for every
 * write — the path segment (e.g. `"/admin/remove-user"`,
 * `"/organization/delete"`) carries the semantics, not the HTTP method.
 * Do not attempt to use `PATCH`, `PUT`, or `DELETE` for admin /
 * organisation endpoints — those methods belong exclusively to the
 * OAuth2 client-management plugin.
 *
 * @param path  — path relative to `/api/auth` (e.g. `"/admin/remove-user"`)
 * @param body  — optional JSON-serialisable request body
 * @param init  — optional `RequestInit` overrides
 */
export async function authApiPostOrThrow<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await apiPostFetch(path, body, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

/**
 * POST a Better Auth endpoint with an `application/x-www-form-urlencoded` body
 * and throw `new Error(body)` on !ok.
 *
 * Use for standards-defined OAuth endpoints that require form encoding and may
 * authenticate the client with headers. Do not use this for admin CRUD JSON
 * mutations; use {@link authApiPostOrThrow} there.
 *
 * @param path  — path relative to `/api/auth` (e.g. `"/oauth2/introspect"`)
 * @param body  — URLSearchParams carrying the form body
 * @param init  — optional `RequestInit` overrides
 */
export async function authApiFormPostOrThrow<T>(path: string, body: URLSearchParams, init?: RequestInit): Promise<T> {
  const res = await apiFormPostFetch(path, body, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

// ─── Public PATCH / DELETE helpers (OAuth plugin endpoints only) ───

/**
 * PATCH a Better Auth OAuth-plugin endpoint and throw `new Error(body)` on !ok.
 *
 * Use only for the resource-server / scope-catalog plugin update endpoints,
 * which take flat (non-`data:`-wrapped) bodies and respond with the updated
 * entity. Do NOT use for admin/organization endpoints — those are POST-only
 * (see {@link authApiPostOrThrow}).
 *
 * @param path  — path relative to `/api/auth` (e.g. `"/admin/resource-servers/abc"`)
 * @param body  — flat JSON-serialisable request body
 * @param init  — optional `RequestInit` overrides
 */
export async function authApiPatchOrThrow<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await apiBodyFetch("PATCH", path, body, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

/**
 * DELETE a Better Auth OAuth-plugin endpoint and throw `new Error(body)` on !ok.
 *
 * Use only for the resource-server / M2M-binding plugin delete endpoints.
 * Do NOT use for admin/organization endpoints — those are POST-only
 * (see {@link authApiPostOrThrow}).
 *
 * @param path  — path relative to `/api/auth` (e.g. `"/admin/resource-servers/abc"`)
 * @param init  — optional `RequestInit` overrides
 */
export async function authApiDeleteOrThrow<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiBodyFetch("DELETE", path, undefined, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
