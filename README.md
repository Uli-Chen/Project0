# project 0

Oadwook Lab 的语言学习项目。当前实现聚焦 IELTS Task 2 写作：设置目标、入门测试、写前梳理、写作辅助、评估、改写与对比。

## 当前实现

0.4 已增加主题题库、确定性推荐、速刷主题卡片、原话来源、独立完成记录与 40 分钟检查点。新能力默认关闭；`QUESTION_BANK_ENABLED=true` 开启题库，`QUICK_ENABLED=true` 开启速刷，`CHECKPOINTS_ENABLED=true` 开启检查点，后两项同时依赖题库开关。`FOCUS_ENABLED` 保持关闭。`/essays` 是作文库，`/cards` 是卡片复习页。

升级已有环境必须依次执行 `db:migrate`、`db:import-questions`、`db:migrate-0.4`，之后重启服务。先关闭新功能验证兼容读取，再逐项开放。上线流程与备份见 `deploy/README.md`。

速刷保持 512/768 输出 token 和每次最多 25 秒的限额。官方 DeepSeek 的速刷调用显式使用非思考模式，避免默认思考消耗短输出额度；评分和其他 provider 的参数不受影响。技术失败可重试，检查期间仍可保存，新版本不会被迟到检查覆盖。

- 邮箱与密码注册、登录、退出、用户中心、修改密码和删除账户。
- 每个账户独立保存问卷、作文草稿、对话、反馈、改写和练习评分；首页、计划、记忆和进展从当前账户的数据生成。
- 服务端调用已配置的 OpenAI 兼容模型接口。模型返回经 Zod 校验后进入流程，失败时保留已保存内容并提供重试。
- 练习草稿保存在 SQLite，重新登录后可以继续。客户端通过版本号检查冲突，服务端串行处理同一练习的修改与模型操作。
- 亮色、深色和跟随系统外观，使用同一套纸面与墨色设计变量。

旧的 `lib/prototype/` 中仍保留部分类型和素材。业务页面已使用当前用户的服务端数据；共享的会话状态入口通过 API 工作。

目前没有邮件发送服务，因此不提供邮箱验证或邮件找回密码。学习计划是依据目标、练习节奏和已有反馈生成的建议；模型评分用于练习参考，不是官方考试成绩。

## 技术栈

- Node.js 24、npm 11；版本见 `.nvmrc` 和 `package.json`，依赖由 `package-lock.json` 锁定。
- Next.js App Router、React、TypeScript、Node 运行时。
- Tailwind CSS、共享 UI 控件、本地字体。
- SQLite、better-sqlite3、Drizzle ORM / Kit；Zod 校验输入与结构化模型输出。

## 本地启动

准备 Node.js 24 和 npm 11，在项目根目录执行：

```sh
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

已有 `.env.local` 时保留该文件，补全需要的配置。当前默认暂停注册；本地开发需要创建账户时，在 `.env.local` 设置 `REGISTRATION_ENABLED=true` 并重启，然后访问 [本地应用](http://localhost:3000)，选择「创建账户」，填写学习目标后开始测试或练习。注册开放时，无模型密钥仍可注册、设置资料、创建练习和保存草稿；教练与评估操作会明确提示模型尚未配置。

| 配置 | 作用 |
|---|---|
| `DATABASE_PATH` | SQLite 文件路径，默认 `./data/app.db`；不是数据库 URL |
| `DATABASE_BACKUP_DIR` | 备份目录，默认 `./backups` |
| `APP_ORIGIN` | 可选的对外访问源，例如 `https://write.example.com`；反向代理部署时建议填写，必须与浏览器访问的协议、域名和端口一致 |
| `REGISTRATION_ENABLED` | 注册默认关闭；只有设置为 `true` 并重启才允许创建账户，已有账户仍可登录 |
| `LLM_BASE_URL` | OpenAI 兼容接口根路径，客户端请求其 `/chat/completions` |
| `LLM_API_KEY` | 仅服务端读取的模型密钥 |
| `LLM_MODEL` | 模型名称 |

环境变量优先于环境文件。CLI 使用 Next.js 环境文件加载方式，默认读取开发环境；部署命令使用 `NODE_ENV=production`。修改数据库路径后需要重启进程。

当前默认使用 DeepSeek 官方 `https://api.deepseek.com` 和 `deepseek-flash`；已依据 [官方调用文档](https://api-docs.deepseek.com/) 与 [JSON 输出文档](https://api-docs.deepseek.com/guides/json_mode/) 核对兼容格式（2026-10-24）。其他兼容服务仍可通过环境变量切换。

## 认证与数据边界

密码使用随机盐和 scrypt 哈希。浏览器仅保存随机会话令牌，数据库保存令牌的 SHA-256 哈希；会话有效期 30 天。Cookie 使用 `HttpOnly`、`SameSite=Lax`，生产环境额外开启 `Secure`，因此生产访问必须通过 HTTPS。

修改密码会撤销原有会话并给当前浏览器签发新会话。异步密码验证之后会再次核对数据库中的密码版本，避免并发修改时使用过期凭据登录或覆盖新密码。退出会撤销当前会话。账户删除要求当前密码和确认文字，并通过外键级联删除认证会话及写作记录。

所有业务 API 从认证 Cookie 获取用户 ID，不接受调用方指定数据所有者。写作记录的主键包含用户 ID，查询、更新与删除均带所有者条件。不存在和属于其他人的练习都返回 404。账户删除期间尚未完成的模型返回不能重新创建已删除数据。

写操作检查完整 Origin，并校验 JSON 输入与请求体大小。登录限流使用数据库中的账户标识和全局计数，不信任客户端发送的 IP 头；伪造 `X-Forwarded-For` 不会重置次数。全局限流是基础保护，公开部署仍应根据实际流量配置入口层请求限制。

用户资料保存在 `users.profile_json`，练习完整状态保存在 `writing_sessions.state_json`。学习记忆和进展从当前用户的反馈记录派生，记忆排除项保存在用户资料中。使用教练、评估或改写功能时，必要的作文、题目、对话和学习偏好会发送给配置的模型服务。数据库与备份包含个人学习数据，需要由部署者限制文件访问。

## 目录

```text
app/
  login/、register/  登录与注册
  (main)/           首页、问卷、计划、记忆、进展、用户中心
  sessions/[id]/    写作练习页
  api/auth/         注册、登录、退出、当前用户、密码与账户删除
  api/profile/      当前用户资料与学习偏好
  api/sessions/     当前用户练习、草稿与教练操作
components/         页面、写作、反馈、主题与共享 UI
lib/
  auth/             凭据、Cookie 会话、输入校验、来源保护与限流
  db/               SQLite 连接、Drizzle Schema 与按用户查询
  pipeline/         写作阶段、输入输出 Schema、模型操作与会话锁
  learning/         当前用户的进展和记忆汇总
  llm/              模型配置、HTTP 调用和输出解析
  prototype/        共享类型、会话客户端入口及遗留素材
  rules/            词数、分句、差异和输入检查
drizzle/            SQL 迁移与生成元数据
scripts/            初始化、备份、模型连通性与回归测试
data/               本地数据库，忽略实际数据文件
artifacts/private/  本地测试账户与检查点，忽略整个目录
原型/               产品规格与最初的流程设计
```

客户端组件不能直接导入数据库连接；`lib/db/client.ts` 使用 `server-only`，连接按需打开并在开发热更新中复用。

## 常用命令与测试

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run check` | ESLint、类型检查、业务回归、数据库回归与生产构建 |
| `npm test` | 模型异常、会话恢复与完整学习流程的确定性回归；不调用真实模型 |
| `npm run test:ui` | 教练 Markdown 渲染、中文粗体兼容及不可信内容过滤的静态渲染回归 |
| `npm run db:init` | 创建数据库并初始化当前基线业务表 |
| `npm run db:generate` | 根据 Drizzle Schema 生成新的迁移 |
| `npm run db:migrate` | 初始化文件并应用未执行迁移 |
| `npm run db:import-questions` | 向 `DATABASE_PATH` 指定的已迁移数据库导入 mock 目录、每题要求与首版别名 |
| `npm run db:studio` | 本地查看数据库 |
| `npm run db:backup` | 使用 SQLite Backup API 创建一致快照 |
| `npm run llm:ping` | 向已配置模型发出普通请求和 JSON 请求 |
| `node --conditions=react-server --import tsx scripts/test-db.ts` | 在自动创建的临时数据库测试迁移、隔离、级联删除与迟到模型结果保存 |
| `TEST_BASE_URL=http://localhost:3000 node scripts/test-auth.mjs` | 对正在运行的开发服务器测试认证、资料与跨账户隔离，最后删除测试账户 |
| `TEST_BASE_URL=http://localhost:3100 node scripts/test-learning.mjs` | 调用真实模型验证完整学习流程；保留 Round 1 测试账户和私有检查点，便于复查及断点续跑 |

HTTP 回归测试使用真实本地接口。认证测试不调用模型；学习测试和 `llm:ping` 会消耗模型服务额度。学习测试的检查点在 `artifacts/private/round1/`，不要提交其中的账户凭据或学习内容。更换服务器或重新从零测试时，应先归档该目录，避免混用旧检查点。

GitHub Actions 当前执行依赖安装、基础检查、确定性业务／数据库回归、迁移和备份验证；不会自动执行需要运行中服务器或模型密钥的 HTTP 测试。

## 数据库迁移

SQLite 启用 WAL、外键检查与 5 秒锁等待。事务保持短小，模型调用在事务外执行。

首次连接会幂等建立当前基线表，让全新本地环境可以直接运行。首个 SQL 迁移使用 `IF NOT EXISTS`，因此在基线初始化之后执行 `db:migrate` 不会重复创建表或索引。迁移日志仍由 Drizzle 管理；后续结构变更需要正式迁移，不能依赖基线初始化升级现有表。

修改结构时：

1. 更新 `lib/db/schema.ts`，执行 `npm run db:generate`。
2. 审查 SQL，对新库和已有数据分别验证迁移。
3. 同时提交 Schema、SQL 与 `drizzle/` 元数据。
4. 升级环境先备份，在维护窗口由单个进程执行迁移，再启动新应用。

已经应用的迁移不要重写；追加迁移表达后续变更。不在有数据的环境用 `drizzle-kit push` 代替迁移历史。基线初始化只负责第一版 Schema；未来增加表或列时，不应把升级逻辑重复写进该初始化函数。

题库导入先执行 `db:migrate`，再执行 `db:import-questions`，两条命令使用同一个 `DATABASE_PATH`。导入默认读取冻结的 `data/question-bank/question_bank.mock.json` 与新增的 `requirements.mock.json`；也可用 `npm run db:import-questions -- <目录路径> <要求路径>` 指定待验证文件。每次导入的校验、题目版本切换与别名写入在一个事务内，失败整体回滚。同一题目版本的内容（包含每题要求）不可覆盖；内容修改必须增加题目版本。负责人逐题审阅要求文件后才可导入非测试数据库。

本地自测可用 `mktemp -d` 创建目录，把 `DATABASE_PATH` 指向该目录下的 `questions.db`；不要用真实数据验证失败或升级案例。导入脚本不自动执行迁移，也不会修改题库来源文件。`test:db` 自动使用临时库，覆盖空库全量迁移与保留旧用户、认证和会话数据的升级。

## 部署与备份

当前支持单个常驻 Node 进程和持久本地磁盘。会话操作锁位于进程内，不能直接部署为多个 Node 副本或临时文件系统上的无状态函数；扩容前需要共享事务锁或队列及相应数据库迁移。

对外部署需要 HTTPS。反向代理应保留外部 Host，`APP_ORIGIN` 填实际访问源；代理和平台的请求超时需要覆盖模型请求时间，长评估路由允许最长 300 秒。设置绝对 `DATABASE_PATH` 指向持久磁盘，重部署必须保留该目录。使用 Node.js 24 安装和构建，在停机升级期间执行：

```sh
NODE_ENV=production npm run db:migrate
npm run build
npm start
```

`npm run db:backup` 读取现有数据库并生成带 UTC 时间与随机 ID 的备份；源文件不存在会报错。该命令不自动安排定时备份或异机存储，应在部署环境中单独配置。

恢复时停止应用，将完成的备份复制到新目录，避免混入旧的 `-wal` / `-shm` 文件。把 `DATABASE_PATH` 指向恢复文件，检查 SQLite 完整性，执行对应版本迁移，再启动应用并验证账户与练习。

不要直接复制运行中的单个 `.db` 文件作为备份，也不要让多台机器通过网络共享目录同时访问它。定期在独立目录演练恢复。

数据库、备份、`.env.local` 和私有测试资料均不提交 Git。`.env.example` 仅存可公开配置。
