CREATE TABLE `adminActivityLog` (
	`id` text PRIMARY KEY NOT NULL,
	`actorId` text NOT NULL,
	`actorType` text NOT NULL,
	`action` text NOT NULL,
	`targetType` text NOT NULL,
	`targetId` text NOT NULL,
	`before` text,
	`after` text,
	`metadata` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `adminActivityLog_actorId_idx` ON `adminActivityLog` (`actorId`);--> statement-breakpoint
CREATE INDEX `adminActivityLog_action_idx` ON `adminActivityLog` (`action`);--> statement-breakpoint
CREATE INDEX `adminActivityLog_targetType_idx` ON `adminActivityLog` (`targetType`);--> statement-breakpoint
CREATE INDEX `adminActivityLog_targetId_idx` ON `adminActivityLog` (`targetId`);--> statement-breakpoint
CREATE INDEX `adminActivityLog_createdAt_idx` ON `adminActivityLog` (`createdAt`);