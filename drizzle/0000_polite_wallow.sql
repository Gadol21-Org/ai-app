CREATE TABLE `messages` (
	`seq` bigint unsigned AUTO_INCREMENT NOT NULL,
	`thread_id` varchar(64) NOT NULL,
	`id` varchar(64) NOT NULL,
	`parent_id` varchar(64),
	`format` varchar(32) NOT NULL,
	`content` json NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_seq` PRIMARY KEY(`seq`),
	CONSTRAINT `messages_thread_id` UNIQUE(`thread_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` varchar(64) NOT NULL,
	`title` varchar(255),
	`status` enum('regular','archived','deleted') NOT NULL DEFAULT 'regular',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`last_message_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`thread_id` varchar(64),
	`kind` enum('chat','title') NOT NULL DEFAULT 'chat',
	`model` varchar(128) NOT NULL,
	`input_tokens` int NOT NULL DEFAULT 0,
	`cached_input_tokens` int NOT NULL DEFAULT 0,
	`output_tokens` int NOT NULL DEFAULT 0,
	`cost_usd` decimal(14,8) NOT NULL DEFAULT '0',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `threads_status_last` ON `threads` (`status`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `usage_created` ON `usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `usage_thread` ON `usage_events` (`thread_id`);