CREATE TABLE `adminRole` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`permissions` text NOT NULL,
	`system` integer DEFAULT false NOT NULL,
	`createdBy` text,
	`updatedBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adminRole_slug_unique` ON `adminRole` (`slug`);--> statement-breakpoint
CREATE TABLE `adminRoleBinding` (
	`id` text PRIMARY KEY NOT NULL,
	`bindingKey` text NOT NULL,
	`principalType` text NOT NULL,
	`principalId` text NOT NULL,
	`roleId` text NOT NULL,
	`scope` text NOT NULL,
	`expiresAt` integer,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`roleId`) REFERENCES `adminRole`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adminRoleBinding_bindingKey_unique` ON `adminRoleBinding` (`bindingKey`);--> statement-breakpoint
CREATE INDEX `adminRoleBinding_principalId_idx` ON `adminRoleBinding` (`principalId`);--> statement-breakpoint
CREATE INDEX `adminRoleBinding_roleId_idx` ON `adminRoleBinding` (`roleId`);--> statement-breakpoint
CREATE INDEX `adminRoleBinding_scope_idx` ON `adminRoleBinding` (`scope`);