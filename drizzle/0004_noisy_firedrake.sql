CREATE TABLE `quick_check_results` (
	`check_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`card_version` integer NOT NULL,
	`outcome` text NOT NULL,
	`results_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`attempt_id`) REFERENCES `writing_sessions`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quick_operation_inputs` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`input_json` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`attempt_id`) REFERENCES `writing_sessions`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quick_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`card_id` text NOT NULL,
	`card_version` integer NOT NULL,
	`kind` text NOT NULL,
	`slot` text NOT NULL,
	`package_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quick_operations_kind" CHECK("quick_operations"."kind" IN ('followup','check')),
	CONSTRAINT "quick_operations_status" CHECK("quick_operations"."status" IN ('running','ok','needs_development','invalid_output','timeout','quota_exhausted','stale','indeterminate'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quick_operations_slot` ON `quick_operations` (`user_id`,`attempt_id`,`kind`,`slot`);--> statement-breakpoint
CREATE TABLE `quick_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`card_id` text NOT NULL,
	`kind` text NOT NULL,
	`granted_at` text NOT NULL,
	`closed_at` text,
	`limits_json` text NOT NULL,
	`used_json` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quick_packages_kind" CHECK("quick_packages"."kind" IN ('initial','supplemental'))
);
--> statement-breakpoint
CREATE INDEX `quick_packages_card` ON `quick_packages` (`user_id`,`card_id`);--> statement-breakpoint
CREATE TABLE `topic_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_version` integer NOT NULL,
	`content_version` integer NOT NULL,
	`content_json` text NOT NULL,
	`state` text NOT NULL,
	`last_check_id` text,
	`last_checked_version` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`attempt_id`) REFERENCES `writing_sessions`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "topic_cards_state" CHECK("topic_cards"."state" IN ('draft','needs_development','passed','unchecked')),
	CONSTRAINT "topic_cards_versions" CHECK("topic_cards"."content_version" >= 0 AND "topic_cards"."question_version" > 0 AND ("topic_cards"."last_checked_version" IS NULL OR "topic_cards"."last_checked_version" BETWEEN 0 AND "topic_cards"."content_version"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_cards_attempt` ON `topic_cards` (`user_id`,`attempt_id`);