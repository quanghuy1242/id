DROP INDEX `oauthClientResourceScope_client_resource_uidx`;--> statement-breakpoint
ALTER TABLE `oauthClientResourceScope` ADD `clientResourceKey` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClientResourceScope_clientResourceKey_unique` ON `oauthClientResourceScope` (`clientResourceKey`);--> statement-breakpoint
ALTER TABLE `oauthResourceScope` ADD `resourceScopeKey` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `oauthResourceScope_resourceScopeKey_unique` ON `oauthResourceScope` (`resourceScopeKey`);