# Access Screens

The Access section groups platform access-control surfaces from docs/031: human authority, machine principals, resource APIs, scope catalog, and M2M bindings. Resource APIs, Scope Catalog, and M2M Bindings reuse the OAuth screen specs because their rows and plugin contracts already live in `oauth.md`; this file covers the Access-specific service-account and deferred admins/roles surfaces.

## /admin/platform/access/service-accounts

Lists OAuth clients whose grant types include `client_credentials`, grouped by system (`reference_id == null`) and tenant (`reference_id != null`) tier. This is a presentation lens over OAuth clients, not a separate service-account table.

```text
┌────────────────────────────────────────────────────────────────┐
│ Service Accounts                                      [+ New]  │
│ Total 7 · System 2 · Tenant 5 · Disabled 0                      │
│ [Search service accounts...]                                    │
│ Name                 Client ID              Tier      Scopes    │
│ id scim directory    cli_dir_a1b2…          System    identity:* │
│ content worker       cli_content_…          Tenant    content:*  │
└────────────────────────────────────────────────────────────────┘
```

Components:
  PageBody > ApplicationsContent(variant="serviceAccounts", createHref="/admin/platform/oauth/applications/new")
  ApplicationsContent renders PageIntro(title="Service Accounts"), StatGroup(Total/System/Tenant/Disabled), SearchInput, DataTable, Rotate/Delete dialogs, and one-time secret dialog.

Data: `GET /api/auth/oauth2/get-clients` through `listClients({ kind: "platform" })`, client-side filtered to `client_credentials`; mutations use OAuth client-management endpoints.

## /admin/orgs/:orgId/access/service-accounts

Organization lens for tenant service accounts. Rows are OAuth clients with `grant_types` including `client_credentials` and `reference_id == :orgId`; the active-organization bridge is called only inside the OAuth client action wrapper before Better Auth client endpoints.

```text
┌────────────────────────────────────────────────────────────────┐
│ Service Accounts                                      [+ New]  │
│ Total 3 · System 0 · Tenant 3 · Disabled 0                      │
│ [Search service accounts...]                                    │
│ Name                 Client ID              Type      Scopes    │
│ content worker       cli_content_…          M2M       content:* │
└────────────────────────────────────────────────────────────────┘
```

Components:
  PageBody > ApplicationsContent(scope={organization}, variant="serviceAccounts", createHref="/admin/orgs/:orgId/oauth/applications/new")
  ApplicationsContent uses the organization-scoped SWR key and list/mutate actions; no raw fetch in route files.

Data: `GET /api/auth/oauth2/get-clients` through `listClients({ kind: "organization", organizationId })`, client-side filtered to `reference_id == organizationId` and `client_credentials`; mutations use OAuth client endpoints after the active-org bridge.

## /admin/platform/access/admins-roles

Read-only derived view for human principals holding authority. Full delegated role management is deferred by docs/031 §4.8 and docs/028 §8.10; this route intentionally has no role-management controls.

```text
┌────────────────────────────────────────────────────────────────┐
│ Admins & Roles                                                  │
│ Platform admins 1 · Org authorities 2 · Organizations 1         │
│ [Search principals, scopes, or roles...]                        │
│ Principal            Authority          Scope        Source     │
│ John Doe             Platform Admin     Platform     user.role  │
│ Jane Adams           Org Admin          Acme Corp    member.role│
└────────────────────────────────────────────────────────────────┘
```

Components:
  PageBody > AdminsRolesContent
  AdminsRolesContent renders PageIntro(title="Admins & Roles"), StatGroup(Platform admins, Org authorities, Organizations), SearchInput, and read-only DataTable.

Data: Composed from existing Better Auth endpoints only: `GET /api/auth/admin/list-users?filterField=role&filterValue=admin&filterOperator=eq`, `GET /api/auth/organization/list`, `GET /api/auth/organization/list-members?organizationId=:orgId`, and `GET /api/auth/admin/get-user?id=:userId` for member enrichment. No delegated-admin table or management endpoint exists in v1.
