CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`purpose` text NOT NULL,
	`operation_id` text,
	`package_id` text,
	`attempt` integer NOT NULL,
	`model` text NOT NULL,
	`config_version` text NOT NULL,
	`started_at` text NOT NULL,
	`latency_ms` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`reserved_input` integer NOT NULL,
	`reserved_output` integer NOT NULL,
	`reserved_ms` integer NOT NULL,
	`outcome` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "llm_calls_outcome" CHECK("llm_calls"."outcome" IN ('reserved','ok','timeout','invalid_output','provider_error','indeterminate')),
	CONSTRAINT "llm_calls_nonnegative" CHECK("llm_calls"."attempt" > 0 AND "llm_calls"."reserved_input" >= 0 AND "llm_calls"."reserved_output" >= 0 AND "llm_calls"."reserved_ms" >= 0 AND ("llm_calls"."input_tokens" IS NULL OR "llm_calls"."input_tokens" >= 0) AND ("llm_calls"."output_tokens" IS NULL OR "llm_calls"."output_tokens" >= 0) AND ("llm_calls"."latency_ms" IS NULL OR "llm_calls"."latency_ms" >= 0))
);
--> statement-breakpoint
CREATE INDEX `llm_calls_user_started` ON `llm_calls` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `llm_calls_package` ON `llm_calls` (`user_id`,`package_id`);--> statement-breakpoint
CREATE INDEX `llm_calls_operation` ON `llm_calls` (`user_id`,`operation_id`);