ALTER TABLE `adminActivityLog` ADD `scope` text;--> statement-breakpoint
ALTER TABLE `adminActivityLog` ADD `organizationId` text;--> statement-breakpoint
ALTER TABLE `adminActivityLog` ADD `actorPlatformRole` text;--> statement-breakpoint
ALTER TABLE `adminActivityLog` ADD `actorOrganizationRole` text;--> statement-breakpoint
ALTER TABLE `adminActivityLog` ADD `steppedUp` integer;--> statement-breakpoint
CREATE INDEX `adminActivityLog_scope_idx` ON `adminActivityLog` (`scope`);--> statement-breakpoint
CREATE INDEX `adminActivityLog_organizationId_idx` ON `adminActivityLog` (`organizationId`);--> statement-breakpoint
CREATE INDEX `adminActivityLog_steppedUp_idx` ON `adminActivityLog` (`steppedUp`);