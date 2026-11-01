CREATE TABLE `attempt_markers` (
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`activity` text NOT NULL,
	`mode` text NOT NULL,
	`question_id` text,
	`question_version` integer,
	`exposure_key` text,
	`primary_topic` text,
	`question_type` text,
	`created_at` text,
	`deleted_at` text,
	`resolution` text NOT NULL,
	PRIMARY KEY(`user_id`, `attempt_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `completion_events` (
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`activity` text NOT NULL,
	`exposure_key` text,
	`question_id` text,
	`primary_topic` text,
	`question_type` text,
	`completed_at` text,
	`original_submitted_at` text,
	`freshness` text NOT NULL,
	`relation` text NOT NULL,
	`legacy` integer DEFAULT false NOT NULL,
	`evidence_deleted` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`user_id`, `attempt_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "completion_freshness" CHECK("completion_events"."freshness" IN ('fresh', 'repeat', 'unknown')),
	CONSTRAINT "completion_relation" CHECK("completion_events"."relation" IN ('none', 'continuation', 'rewrite')),
	CONSTRAINT "completion_legacy_time" CHECK("completion_events"."completed_at" IS NOT NULL OR "completion_events"."legacy" = 1)
);
--> statement-breakpoint
CREATE TABLE `default_continuations` (
	`user_id` text NOT NULL,
	`quick_attempt_id` text NOT NULL,
	`deep_attempt_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `quick_attempt_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `familiarity` (
	`user_id` text NOT NULL,
	`exposure_key` text NOT NULL,
	`first_attempt_id` text NOT NULL,
	`first_attempt_at` text,
	`deep_original_submitted` text DEFAULT 'none' NOT NULL,
	`first_deep_original_at` text,
	`fresh_attempt_id` text,
	`prior_feedback` text DEFAULT 'none' NOT NULL,
	`external_practice` text,
	PRIMARY KEY(`user_id`, `exposure_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "familiarity_submission" CHECK("familiarity"."deep_original_submitted" IN ('none', 'known', 'unknown_time')),
	CONSTRAINT "familiarity_feedback" CHECK("familiarity"."prior_feedback" IN ('none', 'known', 'unknown_time')),
	CONSTRAINT "familiarity_external" CHECK("familiarity"."external_practice" IS NULL OR "familiarity"."external_practice" IN ('no', 'yes', 'unsure'))
);
--> statement-breakpoint
CREATE TABLE `legacy_scan` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cutoff_bank_version` text NOT NULL,
	`alias_version` text NOT NULL,
	`cutoff_exposure_keys_json` text NOT NULL,
	`unresolved_count` integer NOT NULL,
	`scanned_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "legacy_scan_nonnegative" CHECK("legacy_scan"."unresolved_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `request_receipts` (
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`attempt_id` text NOT NULL,
	`action` text NOT NULL,
	`params_hash` text NOT NULL,
	`result_ref` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `request_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
