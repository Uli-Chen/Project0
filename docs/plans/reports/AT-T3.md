# AT-T3 线程与执行恢复集成报告

线程与schema纯函数详见 [核心报告](AT-T3-core.md)。runAction 通过单独 tutor runtime 接入；会话读取保留原始 tutor，不给旧会话注入额外 null 字段；新教学动作在使用前校验子树，损坏或未来版本返回409并保留原始内容。

动作路由接受时保存 pendingAction.tutor，冻结开关、讲解语言、promptConfigVersion；同 requestId 恢复复用快照。版本过期、旧请求无快照或晚到检查失败时保留 pendingAction 原始输入并标 retryable:false，客户端可重新发送新 requestId。

模型完成后比较真实使用的自述难点、会话 version 和 tutor 状态；删除/改写/停用来源或其他写入使结果作废，回复、提纲和教学状态均不提交。12项真实路由测试覆盖上述交错、幂等及旧请求恢复，详见 tests/tutor-api.test.ts 和 [统一验收](AT-ACCEPTANCE.md)。
