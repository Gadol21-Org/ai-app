DELETE FROM `pending_approvals`;--> statement-breakpoint
ALTER TABLE `pending_approvals` MODIFY COLUMN `id` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `pending_approvals` ADD `thread_id` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `pending_approvals` ADD `schedule_id` varchar(36);--> statement-breakpoint
ALTER TABLE `pending_approvals` ADD `resolved_by` varchar(36);--> statement-breakpoint
CREATE INDEX `pending_approvals_thread` ON `pending_approvals` (`thread_id`);--> statement-breakpoint
ALTER TABLE `pending_approvals` DROP COLUMN `source`;--> statement-breakpoint
ALTER TABLE `pending_approvals` DROP COLUMN `source_id`;--> statement-breakpoint
ALTER TABLE `pending_approvals` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `pending_approvals` DROP COLUMN `input`;