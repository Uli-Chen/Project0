import "server-only";
import { readFeatures } from "../config/features";
import { getDb } from "../db/client";
import type { CallRecord } from "./calls";
export function cleanCallPayloads(now = new Date().toISOString(), sqlite = getDb().$client) {
  return sqlite.prepare("DELETE FROM llm_call_payloads WHERE call_id IN (SELECT call_id FROM llm_call_payloads WHERE expires_at <= ? ORDER BY expires_at LIMIT 500)").run(now).changes;
}
export function writeCallPayload(call: CallRecord, requestJson: string, responseText: string | null) {
  if (!readFeatures().LLM_PAYLOADS_ENABLED) return;
  try {
    const sqlite = getDb().$client, now = new Date().toISOString();
    cleanCallPayloads(now, sqlite);
    // Owner/session FK prevents a late result resurrecting deleted practice content.
    sqlite.prepare("INSERT INTO llm_call_payloads(call_id,user_id,session_id,created_at,expires_at,request_json,response_text) VALUES(?,?,?,?,?,?,?)").run(call.id,call.userId,call.sessionId,now,new Date(Date.parse(now)+90*86400000).toISOString(),requestJson,responseText);
  } catch { console.error("llm payload write failed"); }
}
