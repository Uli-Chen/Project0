# project0.auglearn.org 部署

- 服务器：`squareofchen@35.201.196.43`（本机 SSH 别名 `auglearn` / `augleran`）。
- 代码：`/home/squareofchen/opc`。
- Node.js 24：`/home/squareofchen/.local/node/bin`。
- 环境变量：`/home/squareofchen/opc/.env.local`，权限 `600`。
- 持久数据库：`/home/squareofchen/opc-data/app.db`，与代码分开。
- 对外源：`APP_ORIGIN=https://project0.auglearn.org`。
- 单实例服务：`opc.service`，监听 `127.0.0.1:3000`。
- Nginx：`/etc/nginx/sites-available/opc`，代理到应用，模型请求超时 360 秒。
- HTTPS：Let's Encrypt，证书位于 `/etc/letsencrypt/live/project0.auglearn.org/`；`certbot.timer` 管理续期。

`nginx.conf` 是首次申请证书前的 HTTP 配置。Certbot 已在服务器配置中添加 HTTPS；后续更新不要用此文件覆盖服务器现有配置。

## Google Cloud CLI

本机通过 Homebrew 安装 `gcloud-cli`，zsh 已启用 PATH 和补全。默认项目是 `project-6ecc043f-171f-491f-947`，区域为 `asia-east1`，可用区为 `asia-east1-b`。

```sh
gcloud compute ssh squareofchen@auglearn --ssh-key-file="$HOME/.ssh/id_rsa"
# 已登记密钥后，也可直接连接：
ssh auglearn
```

SSH 公钥通过 Google Cloud 元数据管理；必须绑定 `squareofchen` 用户。只在服务器 `authorized_keys` 中手动追加，可能在 Google Guest Agent 同步元数据时被覆盖。

## 查看运行状态

注册目前关闭：`REGISTRATION_ENABLED=false`。登录页隐藏创建账户入口，`/register` 显示暂停提示，注册 API 拒绝创建新账户。恢复时在服务器 `.env.local` 设置 `REGISTRATION_ENABLED=true`，执行 `sudo systemctl restart opc`；不需要重新构建。已有账户登录不受此开关影响。

```sh
sudo systemctl status opc nginx --no-pager
sudo journalctl -u opc -n 100 --no-pager
systemctl list-timers certbot.timer
```

## 后续更新

上传前排除 `.git/`、`node_modules/`、`.next/`、`.env*`、`data/`、`backups/`、`artifacts/` 和本地数据库；不要覆盖服务器环境变量或持久数据目录。上传当前工作区会包含未提交的代码。

当前采用原地部署，在维护窗口停服务后上传，避免构建过程中旧进程读取变化的 `.next` 文件。先在服务器备份数据库：

```sh
export PATH=/home/squareofchen/.local/node/bin:$PATH
cd /home/squareofchen/opc
NODE_ENV=production npm run db:backup
sudo systemctl stop opc
# 从本机上传当前代码到 /home/squareofchen/opc，再执行以下命令。
npm ci --no-audit --no-fund
NODE_ENV=production npm run db:migrate
npm run build
sudo systemctl start opc
```

只有安装、迁移、构建全部成功后才启动服务。备份在 `/home/squareofchen/opc-data/backups`；需另行安排异机备份。

注册开放时，从项目目录执行认证回归（自动清理测试账户；不要为测试临时开放生产注册）：

```sh
TEST_BASE_URL=https://project0.auglearn.org npm run test:auth
```

首次部署初始化了服务器数据库，没有复制本机测试账户或学习记录。需要迁移本机数据时，应使用 SQLite Backup API 创建一致快照，再安排停机恢复。
