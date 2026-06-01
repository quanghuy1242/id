/** Returned for successful operations. */
export const HTTP_OK = 200;

/** Returned for a temporary redirect. */
export const HTTP_FOUND = 302;

/** Returned when request input is malformed or unsupported. */
export const HTTP_BAD_REQUEST = 400;

/** Returned when no authenticated actor exists for a protected admin action. */
export const HTTP_UNAUTHORIZED = 401;

/** Returned when an authenticated actor lacks permission for an admin action. */
export const HTTP_FORBIDDEN = 403;

/** Returned when a resource is not found. */
export const HTTP_NOT_FOUND = 404;

/** Returned when the caller has exceeded a rate limit. */
export const HTTP_TOO_MANY_REQUESTS = 429;

/** Returned when service is temporarily unavailable or misconfigured. */
export const HTTP_SERVICE_UNAVAILABLE = 503;
