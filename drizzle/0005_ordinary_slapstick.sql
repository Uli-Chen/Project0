CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`exposure_key` text NOT NULL,
	`question_id` text NOT NULL,
	`question_type` text NOT NULL,
	`started_at` text NOT NULL,
	`deadline_at` text NOT NULL,
	`completed_at` text,
	`submitted_at` text,
	`status` text NOT NULL,
	`reason` text,
	`declaration` text NOT NULL,
	`start_qualified` integer NOT NULL,
	`is_baseline` integer DEFAULT false NOT NULL,
	`evidence_deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkpoint_active_user` ON `checkpoints` (`user_id`) WHERE "checkpoints"."status" = 'in_progress';--> statement-breakpoint
CREATE UNIQUE INDEX `checkpoint_attempt` ON `checkpoints` (`user_id`,`attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkpoint_baseline` ON `checkpoints` (`user_id`) WHERE "checkpoints"."is_baseline" = 1;