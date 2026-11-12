CREATE TABLE `turn_contexts` (
	`thread_id` varchar(64) NOT NULL,
	`message_id` varchar(64) NOT NULL,
	`note` text NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `turn_contexts_thread_message` UNIQUE(`thread_id`,`message_id`)
);
