import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
