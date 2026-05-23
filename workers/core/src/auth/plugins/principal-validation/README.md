# Principal Validation Plugin

`id-principal-validation` owns the authenticated exact-ID validation API used by downstream resource APIs during durable policy writes.

The plugin validates users, organization membership, teams, service-account organization grants, and generic organization administrator facts. It does not list principals, search users, evaluate product roles, or make resource-policy decisions.

Callers authenticate with an M2M token whose audience is the principal-validation audience and whose scope is `identity:principals:validate`.
