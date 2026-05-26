# OAuth Scope Catalog Plugin

`id-oauth-scope-catalog` owns resource-server-bound OAuth scope rows, layer-matched M2M client resource-scope rows, and runtime scope/grant preload helpers. Tenant clients may bind only to a resource server in their `referenceId` organization; infrastructure clients (`referenceId IS NULL`) may bind only to system resource servers and are platform-admin managed.

The plugin stays inside the Better Auth boundary. CRUD endpoints use the Better Auth adapter. Runtime companions use narrowly approved pre-auth lookups only where OAuth Provider needs catalog data before plugin endpoint context exists.

The data model requires unique `(resourceServerId, scope)` and `(clientId, resourceServerId)` pairs. The plugin persists deterministic `resourceScopeKey` and `clientResourceKey` values for those natural keys and declares each as a supported Better Auth `unique: true` field. Endpoint responses omit the internal keys; direct writes outside the plugin contract are not permitted.

It does not model product roles, permissions, concrete resource grants, hierarchy, inheritance, Content IAM policy decisions, or principal-validation endpoints. The authenticated exact-ID validation API lives in `../principal-validation/`.
