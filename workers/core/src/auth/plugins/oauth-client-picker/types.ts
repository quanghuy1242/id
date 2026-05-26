/**
 * Options for the OAuth client picker plugin (`/api/auth/admin/oauth-clients/lookup`).
 *
 * Doc 018 §5.3 D3 keeps Better Auth's RFC 7592-shaped `/oauth2/get-client` as the
 * canonical client metadata shape; this picker wraps the same data behind an
 * M2M-token-authenticated path. Override defaults only when the deployment exposes
 * the system audience under a non-standard URL or scope.
 */
export type OAuthClientPickerPluginOptions = {
  /** Issuer URL the caller token must carry in `iss`. Defaults to BA `baseURL + basePath`. */
  readonly issuer?: string;
  /** Audience the caller token must carry in `aud`. Defaults to the id system resource server. */
  readonly audience?: string;
  /** Scope the caller token must carry. Defaults to `oauth:clients:read`. */
  readonly scope?: string;
};
