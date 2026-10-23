# project 0

Oadwook Lab 的语言学习项目，长期覆盖听力、阅读与写作。当前原型聚焦首篇作文到第一次改写完成。

## 当前状态

仓库包含产品规格和可运行的工程骨架。首页刻意保持空白，API 与业务模块只有预留目录；数据库 Schema 为空，没有用户、作文、评估等业务表，也没有模型调用。`原型/` 中的数据模型是后续实现规格，不代表已实现。

## 技术栈

- Node.js 24 LTS、npm 11；使用 `.nvmrc` 指定 Node 主版本，`package-lock.json` 锁定依赖。
- Next.js App Router、React、TypeScript；前后端在同一项目，使用 Node 运行时。
- Tailwind CSS、shadcn/ui；已配置主题变量、路径别名和 CLI，暂未添加具体 UI 组件。
- SQLite、better-sqlite3、Drizzle ORM / Kit；本地文件存储、版本化 SQL 迁移。
- Zod 校验环境配置，ESLint 和 TypeScript 检查工程。

## 本地启动

先准备 Node.js 24 和 npm 11；使用 nvm 时可以执行 `nvm install`、`nvm use`。

在项目根目录执行：

```sh
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

已有 `.env.local` 时保留现有文件。访问 http://localhost:3000 会看到空白页面，这是本阶段的预期结果。初始化数据库不会添加业务表；迁移工具可能创建自己的内部记录表。

## 目录与边界

```text
app/                 Next.js 页面与路由；当前只有空白首页和根布局
  api/               后端 API 预留目录
components/ui/       shadcn/ui 组件预留目录
hooks/               前端 hooks 预留目录
lib/
  utils.ts           UI 类名工具
  db/                数据库配置、连接与空 Schema
    queries/         数据访问函数预留目录
  pipeline/          业务流程预留目录
  rules/             业务规则预留目录
  llm/               模型调用预留目录
prompts/             提示词预留目录
drizzle/             提交到 Git 的迁移文件和元数据
scripts/             数据库初始化、备份工具
data/                本地数据库；仅 .gitkeep 进入 Git
backups/             本地备份；不进入 Git
原型/                产品与 workflow 规格
```

前端组件不得直接访问数据库。后续服务端代码通过 `lib/db/client.ts` 的 `getDb()` 获取连接，该入口使用 `server-only` 防止误导入客户端。连接按需创建，并在热更新时复用；编译和空白首页不依赖数据库文件。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` / `npm start` | 构建 / 启动生产服务器 |
| `npm run check` | ESLint、类型检查、生产构建 |
| `npm run db:init` | 创建数据库目录和空数据库，启用 WAL 与外键检查 |
| `npm run db:generate` | 从 Schema 生成迁移文件 |
| `npm run db:migrate` | 初始化文件并应用未执行的迁移 |
| `npm run db:studio` | 本地数据库查看工具 |
| `npm run db:backup` | 使用 SQLite Backup API 生成一致快照 |
| `npm run ui:add -- button` | 需要具体组件时添加 shadcn/ui 组件 |

GitHub Actions 已配置依赖安装、基础检查、迁移和备份验证；推送后才会在 GitHub 上执行。业务测试随模块实现加入。

## 数据库配置与迭代

`DATABASE_PATH` 是文件路径，不是连接 URL；默认 `./data/app.db`。相对路径从项目根目录解析，部署时建议改成持久磁盘上的绝对路径。`DATABASE_BACKUP_DIR` 默认 `./backups`。环境变量优先于环境文件；CLI 使用 Next.js 环境文件加载机制，默认按开发环境加载，部署时用 `NODE_ENV=production npm run db:migrate`（备份同理）。修改数据库路径后重启进程。

应用连接启用外键检查、WAL 和 5 秒锁等待。业务事务应保持短小，模型调用放在事务外。

新增业务表时：

1. 修改 `lib/db/schema.ts`。
2. 执行 `npm run db:generate`，审查生成的 SQL。
3. 在本地执行 `npm run db:migrate`，验证已有数据的兼容性。
4. 将 Schema、SQL 和 `drizzle/` 元数据与业务代码一起提交。
5. 试用环境升级前备份，在维护窗口由单个进程执行迁移，再启动应用。

已经应用的迁移不重写；后续调整追加迁移。不把自动迁移放进 API 请求，也不在试用数据库上直接使用 `drizzle-kit push` 替代迁移历史。将来更换 PostgreSQL 需要单独转换 Schema、导入数据并验证，不能仅修改连接配置。

## 备份与迁移到另一台机器

`npm run db:backup` 读取现有数据库，生成带 UTC 时间和随机 ID 的备份文件。源数据库不存在会报错，避免路径写错时生成空备份。备份命令不会自动安排每日执行或上传异机存储，这些在确定部署环境后配置。

恢复或搬家时：

1. 部署对应版本代码，使用 Node.js 24 执行 `npm ci`。
2. 将已完成的备份复制到一个新的持久目录，避免混入旧数据库的 `-wal` / `-shm` 文件。
3. 在停机状态下将 `DATABASE_PATH` 指向恢复文件。
4. 检查 SQLite 完整性，并执行 `npm run db:migrate`，再构建、启动应用。
5. 检查恢复结果后再恢复使用；定期在独立目录演练恢复。

不要直接复制正在运行的单个 `.db` 文件作为备份。不要让多台服务器通过网络共享目录同时访问它。第一阶段采用单个常驻 Node 应用和持久本地磁盘；应用重部署必须保留数据库目录。对外上线的登录、权限、HTTPS 等配置留到相应阶段实现。

数据库、备份、私人样例和 `.env.local` 都不提交 Git。`.env.example` 只包含可公开的配置示例。

## 当前工具链事项

2026-10-23 安装检查：`npm audit --omit=dev` 为 0 条告警；全量审计有 13 条（9 high、4 moderate），来自开发工具中 `braces` 与旧 `esbuild` 的传递依赖，涉及 shadcn CLI、Next.js ESLint 配置和 Drizzle Kit。审计建议的强制修复包含不兼容的旧主版本降级，本次未采用；后续随上游兼容修复更新锁文件。ESLint 目前固定为与 React 插件兼容的 9.x，升级时需一并检查插件支持。
