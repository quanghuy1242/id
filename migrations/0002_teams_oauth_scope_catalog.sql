ALTER TABLE `session` ADD `activeTeamId` text;--> statement-breakpoint
ALTER TABLE `invitation` ADD `teamId` text;--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`organizationId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_organizationId_idx` ON `team` (`organizationId`);--> statement-breakpoint
CREATE TABLE `teamMember` (
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teamMember_teamId_idx` ON `teamMember` (`teamId`);--> statement-breakpoint
CREATE INDEX `teamMember_userId_idx` ON `teamMember` (`userId`);--> statement-breakpoint
CREATE TABLE `oauthResourceScope` (
	`id` text PRIMARY KEY NOT NULL,
	`resourceServerId` text NOT NULL,
	`scope` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`createdBy` text,
	`updatedBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`resourceServerId`) REFERENCES `resourceServer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauthResourceScope_resourceServerId_idx` ON `oauthResourceScope` (`resourceServerId`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauthResourceScope_resourceServerId_scope_uidx` ON `oauthResourceScope` (`resourceServerId`,`scope`);--> statement-breakpoint
CREATE TABLE `oauthClientOrganizationGrant` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`organizationId` text NOT NULL,
	`resourceServerId` text NOT NULL,
	`allowedScopes` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`createdBy` text,
	`updatedBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resourceServerId`) REFERENCES `resourceServer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauthClientOrganizationGrant_clientId_idx` ON `oauthClientOrganizationGrant` (`clientId`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClientOrganizationGrant_client_org_resource_uidx` ON `oauthClientOrganizationGrant` (`clientId`,`organizationId`,`resourceServerId`);
