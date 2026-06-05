import { relations, sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("banReason"),
  banExpires: integer("banExpires", { mode: "timestamp_ms" }),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("activeOrganizationId"),
    activeTeamId: text("activeTeamId"),
    impersonatedBy: text("impersonatedBy"),
    platformStepUpAt: integer("platformStepUpAt"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: integer("accessTokenExpiresAt", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = sqliteTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    metadata: text("metadata"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const team = sqliteTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [index("team_organizationId_idx").on(table.organizationId)],
);

export const teamMember = sqliteTable(
  "teamMember",
  {
    id: text("id").primaryKey(),
    teamId: text("teamId")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("teamMember_teamId_idx").on(table.teamId),
    index("teamMember_userId_idx").on(table.userId),
  ],
);

export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = sqliteTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    teamId: text("teamId"),
    status: text("status").default("pending").notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    inviterId: text("inviterId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
});

export const registrationPolicy = sqliteTable(
  "registrationPolicy",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    status: text("status").default("draft").notNull(),
    mode: text("mode").notNull(),
    clientId: text("clientId"),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    resourceServerId: text("resourceServerId").references(
      () => resourceServer.id,
      { onDelete: "cascade" },
    ),
    allowedScopes: text("allowedScopes", { mode: "json" }).notNull(),
    emailDomains: text("emailDomains", { mode: "json" }).notNull(),
    defaultRole: text("defaultRole").default("member").notNull(),
    defaultTeamIds: text("defaultTeamIds", { mode: "json" }).notNull(),
    quotaLimit: integer("quotaLimit"),
    quotaTarget: text("quotaTarget").default("memberships").notNull(),
    requiresEmailVerification: integer("requiresEmailVerification", {
      mode: "boolean",
    })
      .default(true)
      .notNull(),
    startsAt: integer("startsAt"),
    expiresAt: integer("expiresAt"),
    createdBy: text("createdBy"),
    updatedBy: text("updatedBy"),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull(),
  },
  (table) => [
    index("registrationPolicy_status_idx").on(table.status),
    index("registrationPolicy_clientId_idx").on(table.clientId),
    index("registrationPolicy_organizationId_idx").on(table.organizationId),
    index("registrationPolicy_resourceServerId_idx").on(table.resourceServerId),
  ],
);

export const registrationIntent = sqliteTable(
  "registrationIntent",
  {
    id: text("id").primaryKey(),
    policyId: text("policyId")
      .notNull()
      .references(() => registrationPolicy.id, { onDelete: "cascade" }),
    clientId: text("clientId").notNull(),
    organizationId: text("organizationId"),
    invitationId: text("invitationId"),
    requestedScopes: text("requestedScopes", { mode: "json" }).notNull(),
    allowedScopes: text("allowedScopes", { mode: "json" }).notNull(),
    resource: text("resource"),
    oauthQuery: text("oauthQuery").notNull(),
    oauthQueryHash: text("oauthQueryHash").notNull(),
    email: text("email"),
    status: text("status").default("started").notNull(),
    expiresAt: integer("expiresAt").notNull(),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull(),
    completedAt: integer("completedAt"),
    userId: text("userId"),
    failureReason: text("failureReason"),
  },
  (table) => [
    index("registrationIntent_policyId_idx").on(table.policyId),
    index("registrationIntent_clientId_idx").on(table.clientId),
    index("registrationIntent_organizationId_idx").on(table.organizationId),
    index("registrationIntent_oauthQueryHash_idx").on(table.oauthQueryHash),
    index("registrationIntent_email_idx").on(table.email),
    index("registrationIntent_status_idx").on(table.status),
    index("registrationIntent_expiresAt_idx").on(table.expiresAt),
    index("registrationIntent_userId_idx").on(table.userId),
  ],
);

export const registrationQuotaReservation = sqliteTable(
  "registrationQuotaReservation",
  {
    id: text("id").primaryKey(),
    policyId: text("policyId")
      .notNull()
      .references(() => registrationPolicy.id, { onDelete: "cascade" }),
    intentId: text("intentId")
      .notNull()
      .unique()
      .references(() => registrationIntent.id, { onDelete: "cascade" }),
    status: text("status").default("reserved").notNull(),
    createdAt: integer("createdAt").notNull(),
    expiresAt: integer("expiresAt").notNull(),
    consumedAt: integer("consumedAt"),
  },
  (table) => [
    index("registrationQuotaReservation_policyId_idx").on(table.policyId),
    index("registrationQuotaReservation_status_idx").on(table.status),
    index("registrationQuotaReservation_expiresAt_idx").on(table.expiresAt),
  ],
);

export const oauthClient = sqliteTable(
  "oauthClient",
  {
    id: text("id").primaryKey(),
    clientId: text("clientId").notNull().unique(),
    clientSecret: text("clientSecret"),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    skipConsent: integer("skipConsent", { mode: "boolean" }),
    enableEndSession: integer("enableEndSession", { mode: "boolean" }),
    subjectType: text("subjectType"),
    scopes: text("scopes", { mode: "json" }),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts", { mode: "json" }),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("softwareId"),
    softwareVersion: text("softwareVersion"),
    softwareStatement: text("softwareStatement"),
    redirectUris: text("redirectUris", { mode: "json" }).notNull(),
    postLogoutRedirectUris: text("postLogoutRedirectUris", { mode: "json" }),
    tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
    grantTypes: text("grantTypes", { mode: "json" }),
    responseTypes: text("responseTypes", { mode: "json" }),
    public: integer("public", { mode: "boolean" }),
    type: text("type"),
    requirePKCE: integer("requirePKCE", { mode: "boolean" }),
    referenceId: text("referenceId"),
    metadata: text("metadata", { mode: "json" }),
  },
  (table) => [index("oauthClient_userId_idx").on(table.userId)],
);

export const oauthRefreshToken = sqliteTable(
  "oauthRefreshToken",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    authTime: integer("authTime", { mode: "timestamp_ms" }),
    scopes: text("scopes", { mode: "json" }).notNull(),
  },
  (table) => [
    index("oauthRefreshToken_clientId_idx").on(table.clientId),
    index("oauthRefreshToken_sessionId_idx").on(table.sessionId),
    index("oauthRefreshToken_userId_idx").on(table.userId),
  ],
);

export const oauthAccessToken = sqliteTable(
  "oauthAccessToken",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    refreshId: text("refreshId").references(() => oauthRefreshToken.id, {
      onDelete: "cascade",
    }),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
    scopes: text("scopes", { mode: "json" }).notNull(),
  },
  (table) => [
    index("oauthAccessToken_clientId_idx").on(table.clientId),
    index("oauthAccessToken_sessionId_idx").on(table.sessionId),
    index("oauthAccessToken_userId_idx").on(table.userId),
    index("oauthAccessToken_refreshId_idx").on(table.refreshId),
  ],
);

export const oauthConsent = sqliteTable(
  "oauthConsent",
  {
    id: text("id").primaryKey(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    scopes: text("scopes", { mode: "json" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("oauthConsent_clientId_idx").on(table.clientId),
    index("oauthConsent_userId_idx").on(table.userId),
  ],
);

export const resourceServer = sqliteTable(
  "resourceServer",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    audience: text("audience").notNull().unique(),
    description: text("description"),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    createdBy: text("createdBy"),
    updatedBy: text("updatedBy"),
    disabledAt: integer("disabledAt"),
    disabledBy: text("disabledBy"),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull(),
  },
  (table) => [
    index("resourceServer_organizationId_idx").on(table.organizationId),
  ],
);

export const oauthResourceScope = sqliteTable(
  "oauthResourceScope",
  {
    id: text("id").primaryKey(),
    resourceServerId: text("resourceServerId")
      .notNull()
      .references(() => resourceServer.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    resourceScopeKey: text("resourceScopeKey").notNull().unique(),
    description: text("description"),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    createdBy: text("createdBy"),
    updatedBy: text("updatedBy"),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull(),
  },
  (table) => [
    index("oauthResourceScope_resourceServerId_idx").on(table.resourceServerId),
  ],
);

export const oauthClientResourceScope = sqliteTable(
  "oauthClientResourceScope",
  {
    id: text("id").primaryKey(),
    clientId: text("clientId").notNull(),
    resourceServerId: text("resourceServerId")
      .notNull()
      .references(() => resourceServer.id, { onDelete: "cascade" }),
    clientResourceKey: text("clientResourceKey").notNull().unique(),
    allowedScopes: text("allowedScopes", { mode: "json" }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    createdBy: text("createdBy"),
    updatedBy: text("updatedBy"),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull(),
  },
  (table) => [
    index("oauthClientResourceScope_clientId_idx").on(table.clientId),
    index("oauthClientResourceScope_resourceServerId_idx").on(
      table.resourceServerId,
    ),
  ],
);

export const adminActivityLog = sqliteTable(
  "adminActivityLog",
  {
    id: text("id").primaryKey(),
    actorId: text("actorId").notNull(),
    actorType: text("actorType").notNull(),
    action: text("action").notNull(),
    targetType: text("targetType").notNull(),
    targetId: text("targetId").notNull(),
    scope: text("scope"),
    organizationId: text("organizationId"),
    actorPlatformRole: text("actorPlatformRole"),
    actorOrganizationRole: text("actorOrganizationRole"),
    steppedUp: integer("steppedUp", { mode: "boolean" }),
    summary: text("summary"),
    details: text("details"),
    before: text("before"),
    after: text("after"),
    metadata: text("metadata"),
    createdAt: integer("createdAt").notNull(),
  },
  (table) => [
    index("adminActivityLog_actorId_idx").on(table.actorId),
    index("adminActivityLog_action_idx").on(table.action),
    index("adminActivityLog_targetType_idx").on(table.targetType),
    index("adminActivityLog_targetId_idx").on(table.targetId),
    index("adminActivityLog_scope_idx").on(table.scope),
    index("adminActivityLog_organizationId_idx").on(table.organizationId),
    index("adminActivityLog_steppedUp_idx").on(table.steppedUp),
    index("adminActivityLog_createdAt_idx").on(table.createdAt),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  teamMembers: many(teamMember),
  members: many(member),
  invitations: many(invitation),
  oauthClients: many(oauthClient),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
}));

export const sessionRelations = relations(session, ({ one, many }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  teams: many(team),
  members: many(member),
  invitations: many(invitation),
  registrationPolicys: many(registrationPolicy),
  resourceServers: many(resourceServer),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  teamMembers: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const registrationPolicyRelations = relations(
  registrationPolicy,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [registrationPolicy.organizationId],
      references: [organization.id],
    }),
    resourceServer: one(resourceServer, {
      fields: [registrationPolicy.resourceServerId],
      references: [resourceServer.id],
    }),
    registrationIntents: many(registrationIntent),
    registrationQuotaReservations: many(registrationQuotaReservation),
  }),
);

export const registrationIntentRelations = relations(
  registrationIntent,
  ({ one, many }) => ({
    registrationPolicy: one(registrationPolicy, {
      fields: [registrationIntent.policyId],
      references: [registrationPolicy.id],
    }),
    registrationQuotaReservation: many(registrationQuotaReservation),
  }),
);

export const registrationQuotaReservationRelations = relations(
  registrationQuotaReservation,
  ({ one }) => ({
    registrationPolicy: one(registrationPolicy, {
      fields: [registrationQuotaReservation.policyId],
      references: [registrationPolicy.id],
    }),
    registrationIntent: one(registrationIntent, {
      fields: [registrationQuotaReservation.intentId],
      references: [registrationIntent.id],
    }),
  }),
);

export const oauthClientRelations = relations(oauthClient, ({ one, many }) => ({
  user: one(user, {
    fields: [oauthClient.userId],
    references: [user.id],
  }),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
}));

export const oauthRefreshTokenRelations = relations(
  oauthRefreshToken,
  ({ one, many }) => ({
    oauthClient: one(oauthClient, {
      fields: [oauthRefreshToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthRefreshToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthRefreshToken.userId],
      references: [user.id],
    }),
    oauthAccessTokens: many(oauthAccessToken),
  }),
);

export const oauthAccessTokenRelations = relations(
  oauthAccessToken,
  ({ one }) => ({
    oauthClient: one(oauthClient, {
      fields: [oauthAccessToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthAccessToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthAccessToken.userId],
      references: [user.id],
    }),
    oauthRefreshToken: one(oauthRefreshToken, {
      fields: [oauthAccessToken.refreshId],
      references: [oauthRefreshToken.id],
    }),
  }),
);

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  oauthClient: one(oauthClient, {
    fields: [oauthConsent.clientId],
    references: [oauthClient.clientId],
  }),
  user: one(user, {
    fields: [oauthConsent.userId],
    references: [user.id],
  }),
}));

export const resourceServerRelations = relations(
  resourceServer,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [resourceServer.organizationId],
      references: [organization.id],
    }),
    registrationPolicys: many(registrationPolicy),
    oauthResourceScopes: many(oauthResourceScope),
    oauthClientResourceScopes: many(oauthClientResourceScope),
  }),
);

export const oauthResourceScopeRelations = relations(
  oauthResourceScope,
  ({ one }) => ({
    resourceServer: one(resourceServer, {
      fields: [oauthResourceScope.resourceServerId],
      references: [resourceServer.id],
    }),
  }),
);

export const oauthClientResourceScopeRelations = relations(
  oauthClientResourceScope,
  ({ one }) => ({
    resourceServer: one(resourceServer, {
      fields: [oauthClientResourceScope.resourceServerId],
      references: [resourceServer.id],
    }),
  }),
);
