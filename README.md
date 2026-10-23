# WriteMentor

AI 英语写作教练，由台湾一人公司运营、主要面向大陆用户。首个开发阶段聚焦雅思 Task 2 的“首篇作文 → 反馈与提示 → 第一次改写 → 对比结果”。

**当前状态：文档与本地任务追踪结构已建立；产品代码尚未开发，产品验收尚未执行。**

## 从这里开始

| 要做的事 | 入口 |
|---|---|
| 理解当前产品与系统边界 | [总览](docs/overview.md) |
| 了解谁做什么、谁审批 | [团队与组织](docs/organization.md)（创始人＋多 Agent） |
| 确认本阶段做什么、如何放行 | [MVP 路线与关口](docs/roadmap.md) |
| 找下一项开发工作、更新进度 | [任务台账](docs/tracking/tasks.md) · [周检记录](docs/tracking/reviews.md) |
| 查看行为、接口和异常要求 | [模块规格索引](docs/specs/README.md) |
| 检查是否真正完成 | [验收清单与追踪矩阵](docs/validation/acceptance.md) |
| 修改方案、记录原因 | [协作流程](docs/workflow.md) · [决策记录](docs/decisions/README.md) |
| 查看改动历史 | [文档变更记录](docs/CHANGELOG.md) |
| 回看原始方案 | [冻结基线 v0.1](docs/baselines/v0.1/README.md) |

原始 `writeup/` 文件保留原样。当前开发规格以 `docs/specs/` 为准；Word、Excel 和历史方案不再作为当前需求的编辑入口。冻结的是规划基线 v0.1，不代表产品已有 v0.1 实现。

## 文档检查

在项目根目录运行：

```sh
python3 scripts/check_docs.py
```

检查冻结文件校验值、文档链接、需求—任务—验收关联、任务依赖和状态字段。它不运行产品测试，也不证明产品验收达标。

仓库已在本地初始化；开发任务当前存放于 Markdown 台账，尚未同步到外部任务系统。

