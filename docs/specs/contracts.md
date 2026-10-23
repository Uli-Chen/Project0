# MVP-1 接口与数据契约

版本：0.2-draft。是实现输入，不是已存在的 API。实现 OpenAPI/数据库迁移时必须与本契约一致；必要变化先更新所属规格。所有时间存 UTC，界面按用户时区显示。

## 资源

| 资源 | 最小字段与约束 |
|---|---|
| User | id、invite_id、adult_confirmed_at、consent_version、consented_at；独立 sample_consent 默认 false |
| PromptItem | id、version、task_code=ielts_ac_task2、text、source_license；使用后版本不可覆盖 |
| PracticeLoop | id、user_id、prompt_id/version、pipeline_version、root_submission_id、completed_at；试用配额关联用户 |
| Draft | id、user_id、loop_id、kind=original/revision、text、revision、timer_started_at、elapsed_sec、updated_at；乐观锁 |
| Submission | id、loop_id、user_id、parent_submission_id、root_submission_id、revision_index=0/1、text、text_hash、duration_sec、assisted、created_at、purge_at |
| Sentence | submission_id、segmenter_version、sentence_id、start_offset、end_offset；组合键唯一 |
| Evaluation | id、submission_id、pipeline_version、status、stage、raw_scores、calibrated_scores、interval|null、flags、failure_code、created_at |
| FeedbackItem | id、evaluation_id、rank、dimension、error_type、evidence[]、explanation、hint；问题解决结果不覆盖此原始记录 |
| TutorTurn | id、feedback_item_id、user_id、level、attempt_no、input_hash、response、check_result、pipeline_version；同一请求唯一 |
| Comparison | id、loop_id、original_eval_id、revision_eval_id、pipeline_version、status、diff、issue_results[]；唯一评估对 |
| Task / Outbox | id、logical_resource_id、stage、status、attempt_count、manual_resume_count、lease_until、deadline、published_at |
| IdempotencyRecord | user_id、operation、key、request_hash、resource_id、response_status；前三项唯一 |
| UsageEvent | attempt_id、provider_request_id、loop_id、task_id、provider/model/version、tokens、latency、price_version、cost、usage_known |
| DeletionJob | id、user_id、scope、tombstone_version、requested_at、active_purged_at、backup_expiry、status |

字符区间使用 Unicode code point、左闭右开；前端 JS 需要转换 UTF-16 索引，必须覆盖 emoji 和中英混合用例。任何引用必须带所属 submission_id，不跨快照解释 offset。

## API

所有资源接口需要身份与归属校验，所有有副作用的 POST/DELETE 使用 Idempotency-Key。GET 不产生模型调用。PUT 草稿使用 If-Match 或等价 revision。

| 方法与路径 | 输入／返回要点 |
|---|---|
| POST `/v1/auth/invite-session` | 邀请凭据换取受保护会话；凭据不写日志 |
| POST `/v1/me/consents` | 成年确认与版本；样本授权单列 |
| GET `/v1/prompts` | 当前 Task 2 题目及版本 |
| POST `/v1/practice-loops` | 题目引用，返回 loop_id；不消耗首稿配额，提交时占用 |
| PUT `/v1/loops/{id}/drafts/{kind}` | text、elapsed_sec、revision；返回新 revision，冲突 409 |
| GET `/v1/loops/{id}/drafts/{kind}` | 最近服务端草稿与 revision |
| POST `/v1/submissions` | loop_id、text、duration_sec；返回 202 + submission_id/evaluation_id/status_url |
| GET `/v1/evaluations/{id}` | 状态、当前阶段、已持久化分数/反馈和可重试标记 |
| GET `/v1/evaluations/{id}/events` | SSE，支持 Last-Event-ID，不能成为状态唯一来源 |
| POST `/v1/evaluations/{id}/retry` | 恢复失败阶段；复用 evaluation_id，返回 202 |
| POST `/v1/feedback/{id}/tutor` | action=hint/question/attempt、attempt_text；服务端确定 level，返回 turn 与额度余量 |
| POST `/v1/submissions/{id}/revisions` | text、duration_sec；返回改写 submission/evaluation_id |
| GET `/v1/loops/{id}/comparison` | pending/ready/failed、不变评估对、diff 和问题状态 |
| POST `/v1/loops/{id}/comparison/retry` | 只恢复比较；不重复评分 |
| POST `/v1/loops/{id}/comparison/viewed` | 就绪结果展示后发送，服务端确认 completion；幂等 |
| POST `/v1/me/data-export` | 返回 job_id；导出只包含本用户数据 |
| GET `/v1/me/data-export/{id}` | 状态及鉴权下载入口 |
| DELETE `/v1/loops/{id}` | 删除该练习及衍生数据，返回 deletion_job_id |
| DELETE `/v1/me` | 注销与全量删除；返回短期删除回执凭证 |
| GET `/v1/deletion-jobs/{id}` | 登录用户或注销后的专用只读回执凭证查询；不能查回正文 |

## 统一响应

错误形状：`{code, message, retryable, trace_id, resource_id?}`。

| 状态 | 含义 |
|---|---|
| 400/422 | 无效参数、空白、技术长度超限；不创建评估 |
| 401 | 会话失效；本机草稿仍保留给原用户重新认证，显式退出则清理 |
| 404 | 不存在、无权访问或已删除 |
| 409 | 幂等键正文冲突、草稿冲突、首次改写已存在或状态不允许 |
| 429 | 频率/并发限制，附 retry_after；不消耗新配额 |
| 503 | 尚未接受请求的暂时故障；已接受任务的失败通过资源状态返回 |

语义不可评分是 Evaluation 的 `not_scorable` 终态，含 reason；不是 HTTP 500，也不是 0 分。

## Evaluation 状态机

```text
queued → running → succeeded
                 → partial → running（仅恢复缺失阶段）
                 → failed  → queued（有限恢复）
                 → not_scorable
queued/running/partial/failed/succeeded/not_scorable → deleted
```

`stage` 单独取 input_check / scoring / adjudication / calibration / feedback。只有评分和反馈都完整才 succeeded；已有评分但反馈缺失为 partial。重复 Worker 用版本号/CAS 条件更新，禁止已完成阶段被重放覆盖。`deleted` 是 tombstone，物理清理按删除任务执行。

比较有自己的 queued/running/ready/failed/deleted 状态，不改写 Evaluation 状态。业务 complete 由两份 succeeded 评估、ready 比较和已确认查看共同决定。

## SSE 与降级

事件字段：`id, evaluation_id, stage, type, created_at, payload`。type 包括 progress、score、issue、done、failure、snapshot_required；score/issue 仅在已持久化后发送。重复 event_id 客户端忽略；断开后重连和 GET 均不重复创建任务。`done` 不代表用户已完成闭环。

首阶段固定初稿与改写 pipeline；配置升级只影响新闭环。成对重评是显式运营操作，保留所有原结果，避免静默重写历史。

