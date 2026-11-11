CREATE TABLE `pending_approvals` (
	`id` varchar(36) NOT NULL,
	`source` enum('schedule') NOT NULL,
	`source_id` varchar(36) NOT NULL,
	`run_id` bigint unsigned,
	`tool_name` varchar(128) NOT NULL,
	`title` varchar(255) NOT NULL,
	`input` json NOT NULL,
	`status` enum('pending','approved','denied','expired') NOT NULL DEFAULT 'pending',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`resolved_at` timestamp(3),
	CONSTRAINT `pending_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_runs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schedule_id` varchar(36) NOT NULL,
	`status` enum('running','success','error','awaiting_approval') NOT NULL,
	`output` text,
	`error` text,
	`started_at` timestamp(3) NOT NULL DEFAULT (now()),
	`finished_at` timestamp(3),
	CONSTRAINT `schedule_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` varchar(36) NOT NULL,
	`title` varchar(120) NOT NULL,
	`prompt` text NOT NULL,
	`kind` enum('once','cron') NOT NULL,
	`run_at` timestamp(3),
	`cron` varchar(120),
	`timezone` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`next_run_at` timestamp(3),
	`last_run_at` timestamp(3),
	`last_status` enum('success','error','awaiting_approval'),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `usage_events` MODIFY COLUMN `kind` enum('chat','title','schedule') NOT NULL DEFAULT 'chat';--> statement-breakpoint
CREATE INDEX `pending_approvals_status` ON `pending_approvals` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `schedule_runs_schedule` ON `schedule_runs` (`schedule_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `schedules_due` ON `schedules` (`enabled`,`next_run_at`);