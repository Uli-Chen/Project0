# AT-T3 线程核心实现记录

2026-11-03。按开发方案 v3 附录 A 实现，纯函数与 schema 已集成；不是独立 owner 验收结论。

实现：`lib/tutor/types.ts` 定义阶段一类型；`thread.ts` 实现开关线程、帮助上限、原话确认与撤回、FIFO 归档、尝试、旧路径对齐、视图与级别同步；`schemas.ts` 在 superRefine 中预演整批增量，拒绝无权示范、假原话、非法引用、重复尝试和错误关闭组合。损坏/未来状态抛 409 类错误，调用方保留原始数据。

验证：`node --conditions=react-server --import tsx --test tests/tutor-thread.test.ts tests/tutor-evaluation.test.ts tests/tutor-runtime.test.ts`，11/11 通过。包括 generateJson 真实解析链配假 fetch 的格式重试；提纲原话替换；提示当轮升级、无 cur；失败状态原子性；示范卡片权限与采用；达标关闭/重新打开；开→关→开对齐。相关文件 eslint 通过，集成时 `npx tsc --noEmit` 通过。

路由执行快照、前端恢复和晚到结果检查由主实现者集成；本报告不将它们计作已单独验证。最终数据库/API/浏览器与全仓库验证见统一验收报告。
