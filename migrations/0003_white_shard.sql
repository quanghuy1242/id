CREATE TABLE `oauthClientResourceScope` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`resourceServerId` text NOT NULL,
	`allowedScopes` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`createdBy` text,
	`updatedBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`resourceServerId`) REFERENCES `resourceServer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauthClientResourceScope_clientId_idx` ON `oauthClientResourceScope` (`clientId`);--> statement-breakpoint
CREATE INDEX `oauthClientResourceScope_resourceServerId_idx` ON `oauthClientResourceScope` (`resourceServerId`);--> statement-breakpoint
DROP INDEX `oauthClientOrganizationGrant_client_org_resource_uidx`;--> statement-breakpoint
CREATE INDEX `oauthClientOrganizationGrant_organizationId_idx` ON `oauthClientOrganizationGrant` (`organizationId`);--> statement-breakpoint
CREATE INDEX `oauthClientOrganizationGrant_resourceServerId_idx` ON `oauthClientOrganizationGrant` (`resourceServerId`);--> statement-breakpoint
DROP INDEX `oauthResourceScope_resourceServerId_scope_uidx`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_resourceServer` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`audience` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`createdBy` text,
	`updatedBy` text,
	`disabledAt` integer,
	`disabledBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_resourceServer`("id", "organizationId", "slug", "name", "audience", "description", "enabled", "createdBy", "updatedBy", "disabledAt", "disabledBy", "createdAt", "updatedAt") SELECT "id", "organizationId", "slug", "name", "audience", "description", "enabled", "createdBy", "updatedBy", "disabledAt", "disabledBy", "createdAt", "updatedAt" FROM `resourceServer`;--> statement-breakpoint
DROP TABLE `resourceServer`;--> statement-breakpoint
ALTER TABLE `__new_resourceServer` RENAME TO `resourceServer`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `resourceServer_audience_unique` ON `resourceServer` (`audience`);--> statement-breakpoint
CREATE INDEX `resourceServer_organizationId_idx` ON `resourceServer` (`organizationId`);