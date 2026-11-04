CREATE TABLE `llm_call_payloads` (
	`call_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`request_json` text NOT NULL,
	`response_text` text,
	FOREIGN KEY (`call_id`) REFERENCES `llm_calls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`) REFERENCES `writing_sessions`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `llm_payloads_expiry` ON `llm_call_payloads` (`expires_at`);--> statement-breakpoint
CREATE INDEX `llm_payloads_session` ON `llm_call_payloads` (`user_id`,`session_id`);--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `call_site` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `stage_group` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `prompt_version` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `params_hash` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `finish_reason` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `reasoning_tokens` integer;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `move` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `allowed_help` integer;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `provided_help` integer;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `warnings_json` text;