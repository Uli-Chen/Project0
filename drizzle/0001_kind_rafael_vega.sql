CREATE TABLE `question_alias_candidates` (
	`alias_version` text NOT NULL,
	`kind` text NOT NULL,
	`alias` text NOT NULL,
	`exposure_key` text NOT NULL,
	PRIMARY KEY(`alias_version`, `kind`, `alias`, `exposure_key`),
	FOREIGN KEY (`alias_version`,`kind`,`alias`) REFERENCES `question_aliases`(`alias_version`,`kind`,`alias`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `question_aliases` (
	`alias_version` text NOT NULL,
	`kind` text NOT NULL,
	`alias` text NOT NULL,
	`status` text NOT NULL,
	`exposure_key` text,
	`reviewed_by` text NOT NULL,
	`note` text NOT NULL,
	PRIMARY KEY(`alias_version`, `kind`, `alias`),
	CONSTRAINT "question_aliases_kind" CHECK("question_aliases"."kind" IN ('legacy_id', 'text')),
	CONSTRAINT "question_aliases_status" CHECK("question_aliases"."status" IN ('matched', 'not_in_catalog', 'ambiguous')),
	CONSTRAINT "question_aliases_exposure" CHECK(("question_aliases"."status" = 'matched' AND "question_aliases"."exposure_key" IS NOT NULL) OR ("question_aliases"."status" != 'matched' AND "question_aliases"."exposure_key" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`exposure_key` text NOT NULL,
	`bank_order` integer NOT NULL,
	`text` text NOT NULL,
	`primary_topic` text NOT NULL,
	`secondary_topics_json` text NOT NULL,
	`question_type` text NOT NULL,
	`pool` text NOT NULL,
	`source_json` text NOT NULL,
	`requirements_json` text NOT NULL,
	`bank_version` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`id`, `version`),
	CONSTRAINT "questions_current_boolean" CHECK("questions"."is_current" IN (0, 1)),
	CONSTRAINT "questions_positive_version_order" CHECK("questions"."version" > 0 AND "questions"."bank_order" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_current_id_unique` ON `questions` (`id`) WHERE "questions"."is_current" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `questions_current_bank_order_unique` ON `questions` (`bank_order`) WHERE "questions"."is_current" = 1;