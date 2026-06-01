CREATE TABLE `registrationIntent` (
	`id` text PRIMARY KEY NOT NULL,
	`policyId` text NOT NULL,
	`clientId` text NOT NULL,
	`organizationId` text,
	`invitationId` text,
	`requestedScopes` text NOT NULL,
	`allowedScopes` text NOT NULL,
	`resource` text,
	`oauthQuery` text NOT NULL,
	`oauthQueryHash` text NOT NULL,
	`email` text,
	`status` text DEFAULT 'started' NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`completedAt` integer,
	`userId` text,
	`failureReason` text,
	FOREIGN KEY (`policyId`) REFERENCES `registrationPolicy`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `registrationIntent_policyId_idx` ON `registrationIntent` (`policyId`);--> statement-breakpoint
CREATE INDEX `registrationIntent_clientId_idx` ON `registrationIntent` (`clientId`);--> statement-breakpoint
CREATE INDEX `registrationIntent_organizationId_idx` ON `registrationIntent` (`organizationId`);--> statement-breakpoint
CREATE INDEX `registrationIntent_oauthQueryHash_idx` ON `registrationIntent` (`oauthQueryHash`);--> statement-breakpoint
CREATE INDEX `registrationIntent_email_idx` ON `registrationIntent` (`email`);--> statement-breakpoint
CREATE INDEX `registrationIntent_status_idx` ON `registrationIntent` (`status`);--> statement-breakpoint
CREATE INDEX `registrationIntent_expiresAt_idx` ON `registrationIntent` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `registrationIntent_userId_idx` ON `registrationIntent` (`userId`);--> statement-breakpoint
CREATE TABLE `registrationPolicy` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`mode` text NOT NULL,
	`clientId` text,
	`organizationId` text,
	`resourceServerId` text,
	`allowedScopes` text NOT NULL,
	`emailDomains` text NOT NULL,
	`defaultRole` text DEFAULT 'member' NOT NULL,
	`defaultTeamIds` text NOT NULL,
	`quotaLimit` integer,
	`quotaTarget` text DEFAULT 'memberships' NOT NULL,
	`requiresEmailVerification` integer DEFAULT true NOT NULL,
	`startsAt` integer,
	`expiresAt` integer,
	`createdBy` text,
	`updatedBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resourceServerId`) REFERENCES `resourceServer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registrationPolicy_slug_unique` ON `registrationPolicy` (`slug`);--> statement-breakpoint
CREATE INDEX `registrationPolicy_status_idx` ON `registrationPolicy` (`status`);--> statement-breakpoint
CREATE INDEX `registrationPolicy_clientId_idx` ON `registrationPolicy` (`clientId`);--> statement-breakpoint
CREATE INDEX `registrationPolicy_organizationId_idx` ON `registrationPolicy` (`organizationId`);--> statement-breakpoint
CREATE INDEX `registrationPolicy_resourceServerId_idx` ON `registrationPolicy` (`resourceServerId`);--> statement-breakpoint
CREATE TABLE `registrationQuotaReservation` (
	`id` text PRIMARY KEY NOT NULL,
	`policyId` text NOT NULL,
	`intentId` text NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`consumedAt` integer,
	FOREIGN KEY (`policyId`) REFERENCES `registrationPolicy`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`intentId`) REFERENCES `registrationIntent`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registrationQuotaReservation_intentId_unique` ON `registrationQuotaReservation` (`intentId`);--> statement-breakpoint
CREATE INDEX `registrationQuotaReservation_policyId_idx` ON `registrationQuotaReservation` (`policyId`);--> statement-breakpoint
CREATE INDEX `registrationQuotaReservation_status_idx` ON `registrationQuotaReservation` (`status`);--> statement-breakpoint
CREATE INDEX `registrationQuotaReservation_expiresAt_idx` ON `registrationQuotaReservation` (`expiresAt`);