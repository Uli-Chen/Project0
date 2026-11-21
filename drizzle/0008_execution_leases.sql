CREATE TABLE IF NOT EXISTS `execution_leases` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `execution_leases_scope_expiry_idx` ON `execution_leases` (`scope`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `llm_calls_unsettled` ON `llm_calls` (`id`) WHERE "llm_calls"."outcome" = 'reserved';
--> statement-breakpoint
CREATE INDEX `quick_operations_running` ON `quick_operations` (`user_id`,`attempt_id`) WHERE "quick_operations"."status" = 'running';
