# OAuth Scope Catalog Plugin

`id-oauth-scope-catalog` owns resource-server-bound OAuth scope rows, org-scoped M2M client grants, and runtime scope/grant preload helpers.

The plugin stays inside the Better Auth boundary. CRUD endpoints use the Better Auth adapter. Runtime companions use narrowly approved pre-auth lookups only where OAuth Provider needs catalog data before plugin endpoint context exists.

It does not model product roles, permissions, concrete resource grants, hierarchy, inheritance, Content IAM policy decisions, or principal-validation endpoints. The authenticated exact-ID validation API lives in `../principal-validation/`.
