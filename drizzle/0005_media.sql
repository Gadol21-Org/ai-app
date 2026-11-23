CREATE TABLE `media` (
	`id` varchar(36) NOT NULL,
	`kind` enum('audio','image','video') NOT NULL,
	`status` enum('generating','ready','failed') NOT NULL DEFAULT 'ready',
	`title` varchar(255) NOT NULL,
	`prompt` text,
	`mime_type` varchar(64),
	`bytes` bigint unsigned,
	`data` longblob,
	`external_id` varchar(128),
	`error` text,
	`details` json,
	`thread_id` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`finished_at` timestamp(3),
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `media_created` ON `media` (`created_at`);--> statement-breakpoint
CREATE INDEX `media_status` ON `media` (`status`);