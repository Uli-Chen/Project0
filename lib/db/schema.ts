import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const llmCalls = sqliteTable("llm_calls", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"), purpose: text("purpose").notNull(),
  operationId: text("operation_id"), packageId: text("package_id"), attempt: integer("attempt").notNull(),
  model: text("model").notNull(), configVersion: text("config_version").notNull(), startedAt: text("started_at").notNull(),
  latencyMs: integer("latency_ms"), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"),
  reservedInput: integer("reserved_input").notNull(), reservedOutput: integer("reserved_output").notNull(), reservedMs: integer("reserved_ms").notNull(),
  outcome: text("outcome", { enum: ["reserved", "ok", "timeout", "invalid_output", "provider_error", "indeterminate"] }).notNull(),
}, t => [
  index("llm_calls_user_started").on(t.userId, t.startedAt), index("llm_calls_package").on(t.userId, t.packageId),
  index("llm_calls_operation").on(t.userId, t.operationId),
  check("llm_calls_outcome", sql`${t.outcome} IN ('reserved','ok','timeout','invalid_output','provider_error','indeterminate')`),
  check("llm_calls_nonnegative", sql`${t.attempt} > 0 AND ${t.reservedInput} >= 0 AND ${t.reservedOutput} >= 0 AND ${t.reservedMs} >= 0 AND (${t.inputTokens} IS NULL OR ${t.inputTokens} >= 0) AND (${t.outputTokens} IS NULL OR ${t.outputTokens} >= 0) AND (${t.latencyMs} IS NULL OR ${t.latencyMs} >= 0)`),
]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  profileJson: text("profile_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("auth_sessions_user_idx").on(table.userId)]);

export const writingSessions = sqliteTable("writing_sessions", {
  id: text("id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stateJson: text("state_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.id] }), index("writing_sessions_user_updated_idx").on(table.userId, table.updatedAt)]);

export const authAttempts = sqliteTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetsAt: integer("resets_at").notNull(),
});

export const questions = sqliteTable("questions", {
  id: text("id").notNull(),
  version: integer("version").notNull(),
  exposureKey: text("exposure_key").notNull(),
  bankOrder: integer("bank_order").notNull(),
  text: text("text").notNull(),
  primaryTopic: text("primary_topic").notNull(),
  secondaryTopicsJson: text("secondary_topics_json").notNull(),
  questionType: text("question_type").notNull(),
  pool: text("pool", { enum: ["practice", "checkpoint_reserved"] }).notNull(),
  sourceJson: text("source_json").notNull(),
  requirementsJson: text("requirements_json").notNull(),
  bankVersion: text("bank_version").notNull(),
  isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  primaryKey({ columns: [table.id, table.version] }),
  uniqueIndex("questions_current_id_unique").on(table.id).where(sql`${table.isCurrent} = 1`),
  uniqueIndex("questions_current_bank_order_unique").on(table.bankOrder).where(sql`${table.isCurrent} = 1`),
  check("questions_current_boolean", sql`${table.isCurrent} IN (0, 1)`),
  check("questions_positive_version_order", sql`${table.version} > 0 AND ${table.bankOrder} > 0`),
]);

export const questionAliases = sqliteTable("question_aliases", {
  aliasVersion: text("alias_version").notNull(),
  kind: text("kind", { enum: ["legacy_id", "text"] }).notNull(),
  alias: text("alias").notNull(),
  status: text("status", { enum: ["matched", "not_in_catalog", "ambiguous"] }).notNull(),
  exposureKey: text("exposure_key"),
  reviewedBy: text("reviewed_by").notNull(),
  note: text("note").notNull(),
}, (table) => [
  primaryKey({ columns: [table.aliasVersion, table.kind, table.alias] }),
  check("question_aliases_kind", sql`${table.kind} IN ('legacy_id', 'text')`),
  check("question_aliases_status", sql`${table.status} IN ('matched', 'not_in_catalog', 'ambiguous')`),
  check("question_aliases_exposure", sql`(${table.status} = 'matched' AND ${table.exposureKey} IS NOT NULL) OR (${table.status} != 'matched' AND ${table.exposureKey} IS NULL)`),
]);

export const questionAliasCandidates = sqliteTable("question_alias_candidates", {
  aliasVersion: text("alias_version").notNull(),
  kind: text("kind", { enum: ["legacy_id", "text"] }).notNull(),
  alias: text("alias").notNull(),
  exposureKey: text("exposure_key").notNull(),
}, (table) => [
  primaryKey({ columns: [table.aliasVersion, table.kind, table.alias, table.exposureKey] }),
  foreignKey({ columns: [table.aliasVersion, table.kind, table.alias], foreignColumns: [questionAliases.aliasVersion, questionAliases.kind, questionAliases.alias] }).onDelete("cascade"),
]);

// These facts contain no student content and survive deleting an attempt.
export const attemptMarkers = sqliteTable("attempt_markers", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull(), activity: text("activity").notNull(), mode: text("mode").notNull(),
  questionId: text("question_id"), questionVersion: integer("question_version"), exposureKey: text("exposure_key"),
  primaryTopic: text("primary_topic"), questionType: text("question_type"),
  createdAt: text("created_at"), deletedAt: text("deleted_at"),
  resolution: text("resolution", { enum: ["matched", "not_in_catalog", "ambiguous", "unmatched"] }).notNull(),
}, t => [primaryKey({ columns: [t.userId, t.attemptId] })]);

export const completionEvents = sqliteTable("completion_events", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull(), activity: text("activity").notNull(),
  exposureKey: text("exposure_key"), questionId: text("question_id"), primaryTopic: text("primary_topic"), questionType: text("question_type"),
  completedAt: text("completed_at"), originalSubmittedAt: text("original_submitted_at"),
  freshness: text("freshness", { enum: ["fresh", "repeat", "unknown"] }).notNull(),
  relation: text("relation", { enum: ["none", "continuation", "rewrite"] }).notNull(),
  legacy: integer("legacy", { mode: "boolean" }).notNull().default(false),
  evidenceDeleted: integer("evidence_deleted", { mode: "boolean" }).notNull().default(false),
}, t => [primaryKey({ columns: [t.userId, t.attemptId] }),
  check("completion_freshness", sql`${t.freshness} IN ('fresh', 'repeat', 'unknown')`),
  check("completion_relation", sql`${t.relation} IN ('none', 'continuation', 'rewrite')`),
  check("completion_legacy_time", sql`${t.completedAt} IS NOT NULL OR ${t.legacy} = 1`),
]);

export const familiarity = sqliteTable("familiarity", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  exposureKey: text("exposure_key").notNull(), firstAttemptId: text("first_attempt_id").notNull(), firstAttemptAt: text("first_attempt_at"),
  deepOriginalSubmitted: text("deep_original_submitted", { enum: ["none", "known", "unknown_time"] }).notNull().default("none"),
  firstDeepOriginalAt: text("first_deep_original_at"), freshAttemptId: text("fresh_attempt_id"),
  priorFeedback: text("prior_feedback", { enum: ["none", "known", "unknown_time"] }).notNull().default("none"),
  externalPractice: text("external_practice", { enum: ["no", "yes", "unsure"] }),
}, t => [primaryKey({ columns: [t.userId, t.exposureKey] }),
  check("familiarity_submission", sql`${t.deepOriginalSubmitted} IN ('none', 'known', 'unknown_time')`),
  check("familiarity_feedback", sql`${t.priorFeedback} IN ('none', 'known', 'unknown_time')`),
  check("familiarity_external", sql`${t.externalPractice} IS NULL OR ${t.externalPractice} IN ('no', 'yes', 'unsure')`),
]);

export const legacyScan = sqliteTable("legacy_scan", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  cutoffBankVersion: text("cutoff_bank_version").notNull(), aliasVersion: text("alias_version").notNull(),
  // Release labels are opaque and questions.bank_version is first introduction,
  // not catalog membership. Freeze the exact cutoff families, without guessing.
  cutoffExposureKeysJson: text("cutoff_exposure_keys_json").notNull(),
  unresolvedCount: integer("unresolved_count").notNull(), scannedAt: text("scanned_at").notNull(),
}, t => [check("legacy_scan_nonnegative", sql`${t.unresolvedCount} >= 0`)]);

export const defaultContinuations = sqliteTable("default_continuations", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  quickAttemptId: text("quick_attempt_id").notNull(), deepAttemptId: text("deep_attempt_id").notNull(), createdAt: text("created_at").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.quickAttemptId] })]);

export const requestReceipts = sqliteTable("request_receipts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestKey: text("request_key").notNull(), attemptId: text("attempt_id").notNull(), action: text("action").notNull(),
  paramsHash: text("params_hash").notNull(), resultRef: text("result_ref").notNull(), createdAt: text("created_at").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.requestKey] })]);

// Quick content has a composite owner/session FK; accounting survives attempt deletion.
export const topicCards = sqliteTable("topic_cards", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull(), questionId: text("question_id").notNull(), questionVersion: integer("question_version").notNull(),
  contentVersion: integer("content_version").notNull(), contentJson: text("content_json").notNull(),
  state: text("state", { enum: ["draft", "needs_development", "passed", "unchecked"] }).notNull(),
  lastCheckId: text("last_check_id"), lastCheckedVersion: integer("last_checked_version"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("topic_cards_attempt").on(t.userId, t.attemptId),
  foreignKey({ columns: [t.userId, t.attemptId], foreignColumns: [writingSessions.userId, writingSessions.id] }).onDelete("cascade"),
  check("topic_cards_state", sql`${t.state} IN ('draft','needs_development','passed','unchecked')`),
  check("topic_cards_versions", sql`${t.contentVersion} >= 0 AND ${t.questionVersion} > 0 AND (${t.lastCheckedVersion} IS NULL OR ${t.lastCheckedVersion} BETWEEN 0 AND ${t.contentVersion})`),
]);
export const quickCheckResults = sqliteTable("quick_check_results", {
  checkId: text("check_id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull(), cardVersion: integer("card_version").notNull(), outcome: text("outcome").notNull(),
  resultsJson: text("results_json").notNull(), createdAt: text("created_at").notNull(),
}, t => [foreignKey({ columns: [t.userId, t.attemptId], foreignColumns: [writingSessions.userId, writingSessions.id] }).onDelete("cascade")]);
export const quickOperations = sqliteTable("quick_operations", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull(), cardId: text("card_id").notNull(), cardVersion: integer("card_version").notNull(),
  kind: text("kind", { enum: ["followup", "check"] }).notNull(), slot: text("slot").notNull(), packageId: text("package_id").notNull(),
  status: text("status", { enum: ["running", "ok", "needs_development", "invalid_output", "timeout", "quota_exhausted", "stale", "indeterminate"] }).notNull(),
  startedAt: text("started_at").notNull(), finishedAt: text("finished_at"),
}, t => [uniqueIndex("quick_operations_slot").on(t.userId, t.attemptId, t.kind, t.slot),
  check("quick_operations_kind", sql`${t.kind} IN ('followup','check')`),
  check("quick_operations_status", sql`${t.status} IN ('running','ok','needs_development','invalid_output','timeout','quota_exhausted','stale','indeterminate')`),
]);
export const quickOperationInputs = sqliteTable("quick_operation_inputs", {
  operationId: text("operation_id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull(), inputJson: text("input_json").notNull(),
}, t => [foreignKey({ columns: [t.userId, t.attemptId], foreignColumns: [writingSessions.userId, writingSessions.id] }).onDelete("cascade")]);
export const quickPackages = sqliteTable("quick_packages", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull(), cardId: text("card_id").notNull(), kind: text("kind", { enum: ["initial", "supplemental"] }).notNull(),
  grantedAt: text("granted_at").notNull(), closedAt: text("closed_at"), limitsJson: text("limits_json").notNull(), usedJson: text("used_json").notNull(),
}, t => [index("quick_packages_card").on(t.userId, t.cardId), check("quick_packages_kind", sql`${t.kind} IN ('initial','supplemental')`)]);
