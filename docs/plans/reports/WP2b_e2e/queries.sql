SELECT user_id, alias_version, unresolved_count, scanned_at FROM legacy_scan;
SELECT attempt_id, exposure_key, legacy, completed_at, original_submitted_at, freshness FROM completion_events ORDER BY rowid;
SELECT exposure_key, deep_original_submitted, first_deep_original_at, prior_feedback, fresh_attempt_id FROM familiarity ORDER BY rowid;
SELECT id, json_extract(state_json, '$.stage') AS stage, json_extract(state_json, '$.reviewStatus') AS review_status, json_extract(state_json, '$.originalSubmittedAt') AS original_submitted_at, json_extract(state_json, '$.originalFreshness') AS original_freshness FROM writing_sessions ORDER BY rowid;
PRAGMA integrity_check;
