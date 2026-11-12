CREATE TABLE `notifications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`title` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`url` varchar(255) NOT NULL DEFAULT '/notifications',
	`read_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`endpoint` varchar(600) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(64) NOT NULL,
	`user_agent` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_endpoint` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(80),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `threads` ADD `user_id` varchar(36);--> statement-breakpoint
ALTER TABLE `usage_events` ADD `user_id` varchar(36);--> statement-breakpoint
CREATE INDEX `notifications_user` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `push_user` ON `push_subscriptions` (`user_id`);