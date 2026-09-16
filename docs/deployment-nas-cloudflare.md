# NAS 与 Cloudflare Tunnel 部署手册

本文档描述如何把 Tourism（导游资格证备考 PWA）部署到家用 NAS，并通过
Cloudflare Tunnel 提供 HTTPS 访问。目标是给出从零到上线、更新、备份、恢复和
排障的完整流程，同时明确哪些安全责任不能交给 Tunnel。

## 1. 架构与信任边界

```text
考生浏览器 / PWA
      |
      | HTTPS
      v
Cloudflare 边缘 + Cloudflare Access（管理员路径）
      |
      | Tunnel 回源
      v
cloudflared（NAS 上运行）
      |
      | http://127.0.0.1:3000
      v
Tourism Docker 容器（Node.js 只读用户端）
```

关键边界：

- 学习记录、错题和模考成绩只保存在考生浏览器，不上传 NAS，也没有账号同步。
- 公开学习页面是只读内容服务；`/admin` 和 `/api/admin/*` 是维护接口，不是用户功能。
- Cloudflare Tunnel 只负责建立出站连接，不是应用认证，也不能替代 NAS 防火墙、
  访问控制、限流、日志脱敏和备份。
- `compose.production.yaml` 只把服务发布到 `127.0.0.1`，不应把 3000 端口映射到
  公网或 NAS 的所有网络接口。
- 生产 Compose 默认不注入 `ADMIN_TOKEN`，管理员 API 保持关闭；用户端不使用
  `ADMIN_TOKEN`。

## 2. 前置条件

### NAS

- 支持 Docker Engine 和 Docker Compose v2。
- 如要在 NAS 上执行本文的 `npm ci`、`npm test` 和内容校验，宿主还需安装 Node.js 22 和 npm；否则可在开发机完成验证，NAS 只执行 Docker 构建和启动。
- 有可用的持久化目录、系统时间同步、磁盘空间和定期备份位置。
- NAS 上已启用自动安全更新；Docker 镜像和依赖也按季度检查更新。
- NAS 管理界面、SSH、SMB、Docker socket 不通过 Tunnel 暴露。
- 建议创建专用低权限账户，例如 `tourism`，只拥有项目目录和备份目录的访问权。

### 网络与 Cloudflare

- 一个托管在 Cloudflare 的域名，例如 `study.example.com`。
- Cloudflare Zero Trust 中可创建 Tunnel 的权限。
- 能访问 Cloudflare Dashboard 和 NAS 的终端。
- 正式用户访问必须是 HTTPS；PWA 安装和 Service Worker 依赖安全上下文。

### 服务器资源

- Node.js 22 是项目最低版本；生产运行由 Docker 镜像提供，不在 NAS 宿主直接运行。
- 初次构建需要下载 Node 依赖和 Docker 基础镜像。
- 题库、来源文件和审核草稿不应提交到 Git；`content/sources/` 和 `content/drafts/`
  已由 `.gitignore` 忽略。

## 3. 目录与文件约定

示例假设项目部署在：

```text
/volume1/docker/tourism
/volume1/backups/tourism
```

实际路径按 NAS 型号调整。部署目录内会使用：

| 路径 | 用途 |
| --- | --- |
| `compose.production.yaml` | 生产 Compose 配置 |
| `Dockerfile` | Node.js 22 运行镜像 |
| `.env` | 本机端口、打赏链接、管理员令牌等配置，不能提交 |
| `.env.example` | 可供参考的变量模板 |
| `scripts/nas-start.sh` | 构建并启动，然后检查 `/health` |
| `scripts/nas-stop.sh` | 停止并移除本项目容器 |
| `scripts/nas-backup.sh` | 打包题库、需求、公开资源和依赖锁文件 |
| `scripts/nas-restore.sh` | 校验并恢复备份归档 |
| `content/exam.json` | 已发布的全国笔试内容 |
| `content/sichuan-practical.json` | 已发布的四川现场考试内容 |

## 4. 首次部署

### 4.1 准备 NAS 目录和账户

使用 NAS 管理界面创建专用账户，例如 `tourism`。将项目放在独立目录，并确保：

- 只有维护者账户可以写入项目目录和 `.env`。
- 备份目录与项目目录分离，最好位于另一块磁盘或远端备份。
- 容器使用非 root 用户运行；当前 Dockerfile 已使用 `node` 用户。
- 不要把 `/var/run/docker.sock` 挂载进容器。

在 NAS 终端切换到项目目录：

```sh
cd /volume1/docker/tourism
```

### 4.2 获取代码和配置

```sh
git clone https://github.com/shizhi3620/tourism_certificate.git .
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，至少确认：

```dotenv
PORT=3000
RATE_LIMIT=120
DONATION_URL=
ADMIN_TOKEN=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_OCR_MODEL=deepseek-chat
DEEPSEEK_OCR_WATERMARKS=
```

变量说明：

| 变量 | 生产用途 | 建议 |
| --- | --- | --- |
| `PORT` | NAS 宿主回源端口，映射到容器内部 3000 | 默认 `3000`；不要暴露到公网 |
| `RATE_LIMIT` | 按 TCP 来源地址计算的每分钟请求上限 | 默认 `120`；cloudflared 在本机回源时所有公网请求可能都来自 `127.0.0.1`，应按全站峰值调整 |
| `DONATION_URL` | 用户端自愿支持入口 | 不填则隐藏 |
| `ADMIN_TOKEN` | 本地内容管理页令牌 | 生产默认留空；只在受保护的管理环境配置强随机值 |
| `DEEPSEEK_*` | 内容草稿生成和 OCR | 不由容器运行时使用；只在维护者终端调用生成脚本时配置 |

生成令牌的示例：

```sh
openssl rand -hex 32
```

不要使用简单密码，不要把 `.env`、Tunnel 凭据或 API Key 提交到 GitHub。

### 4.3 构建并启动

```sh
npm ci
npm run validate:content
npm run check
npm test
scripts/nas-start.sh
```

`nas-start.sh` 会执行健康检查：

```sh
curl --fail --silent http://127.0.0.1:3000/health
```

成功返回：

```json
{"status":"ok","service":"tourism"}
```

查看容器状态和日志：

```sh
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs --tail=100 tourism
```

停止服务：

```sh
scripts/nas-stop.sh
```

## 5. Cloudflare Tunnel

### 5.1 创建 Tunnel

在 Cloudflare Dashboard 中进入 **Zero Trust → Networks → Tunnels**：

1. 创建 Tunnel，选择 NAS 适用的连接方式。
2. 安装 `cloudflared`，建议作为 NAS 系统服务或独立容器在 NAS 上运行。
3. 只把公开 hostname 指向本地 Tourism 服务。

Tunnel 凭据只放在 NAS，权限限制为运行 `cloudflared` 的账户可读，绝不提交仓库。

### 5.2 回源配置

回源只使用本机回环地址：

```yaml
tunnel: <tunnel-uuid>
credentials-file: /etc/cloudflared/<tunnel-uuid>.json
ingress:
  - hostname: study.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

如果 NAS 的 `cloudflared` 运行在容器中，回源地址不能使用容器的 `127.0.0.1` 去访问宿主
服务。应使用 Compose 共享网络，或把回源地址改为能被容器访问的宿主网关地址，同时
确保宿主防火墙只允许该网关访问端口。最稳妥的做法是让 `cloudflared` 和 Tourism
位于同一 Compose 网络。

### 5.3 DNS 与证书

- Tunnel 路由会自动创建或提示创建目标 hostname 的 DNS 记录。
- TLS 由 Cloudflare 边缘终止，用户访问 `https://study.example.com`。
- 不要在 NAS 上额外暴露 HTTP 明文端口。
- 如果使用自有域名，确认 DNS 已由 Cloudflare 托管并处于正确代理状态。

### 5.4 管理员入口保护

公开学习路径可以匿名访问；管理员路径必须额外保护。当前 `compose.production.yaml`
只注入用户端变量，没有注入 `ADMIN_TOKEN`，因此 `/api/admin/*` 在生产容器中始终返回
`401 admin_auth_required`。生产容器还是 `read_only: true`，不适合执行上传、生成或
发布写入。这是推荐的默认边界：**生产 NAS 只运行已审核内容，管理操作在受控的本地
或独立管理环境中完成。**

如果以后确实要开放管理入口，必须先：

1. 为 `/admin` 和 `/api/admin/*` 配置 Cloudflare Access，只允许维护者身份。
2. 创建单独的管理 Compose override，显式注入强随机 `ADMIN_TOKEN`。
3. 只为管理容器挂载受控的 `content/` 可写卷，并保留用户端容器只读。
4. 完成审计日志、CSRF 防护、上传限额和管理会话检查后再公开。
5. 确认管理员令牌不会出现在日志、截图或 Git 中。

没有完成上述步骤时，不要为了“暂时能用”而把生产容器改为可写或把管理页公开。

## 6. 上线验证清单

按顺序执行并在每项通过后再进入下一项：

### 本地服务

```sh
curl --fail --silent http://127.0.0.1:3000/health
curl --fail --silent http://127.0.0.1:3000/api/exam/versions
curl --fail --silent -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

应满足：

- `/health` 返回 `status: ok`。
- `/api/exam/versions` 返回当前发布内容版本。
- 首页返回 `200`，公开题库只包含已发布题目。
- 生产容器的 `/api/admin/*` 未带 Bearer Token 时返回 `401 admin_auth_required`。

### Tunnel

```sh
curl --fail --silent https://study.example.com/health
curl --fail --silent https://study.example.com/api/exam/versions
curl -I https://study.example.com/
```

检查：

- HTTPS 证书有效。
- 首页、Manifest、Service Worker 和图标均为 `200`。
- `http://127.0.0.1:3000` 不对外网开放。
- 直接访问 NAS 管理端口、SSH 端口不会从公网获得响应。

### PWA 真机验证

- iOS Safari：分享 → 添加到主屏幕 → 从主屏幕启动。
- Android Chrome：页面内“立即安装”，或浏览器菜单 → 安装应用。
- 安装后确认能打开题库、执行答题、刷新题库和导出学习记录。
- 断开 NAS 网络后确认最近一次缓存仍可打开；恢复网络后确认题库版本会刷新。
- 换设备或重装前，先从「我的」导出学习记录并在新设备导入。

## 7. 内容更新与发布

题库维护流程见 [`../content/README.md`](../content/README.md)。生产更新遵循：

1. 在受控环境修改内容并通过审核。
2. 只在题目已审核后提交 `content/`。
3. 在 NAS 项目目录执行：

```sh
git fetch origin
git pull --ff-only origin main
npm ci
npm run validate:content
npm run check
npm test
scripts/nas-backup.sh /volume1/backups/tourism
scripts/nas-start.sh
```

4. 重新验证 `/health`、内容版本和首页。
5. 在真实手机上点「刷新题库」确认新版本生效。

`scripts/nas-start.sh` 会执行 `docker compose ... up -d --build`，因此 Git 拉取后的内容会通过
重建镜像生效。Cloudflare Tunnel 不需要重新上传题库；只要 NAS 本地服务仍监听
`127.0.0.1:3000`，Tunnel 会继续转发到同一个回源地址。

## 8. 备份与恢复

### 备份

```sh
scripts/nas-backup.sh /volume1/backups/tourism
```

归档包含：

- `Dockerfile`、`compose.production.yaml`、`.dockerignore` 和 `scripts/`
- `content/`、`requirements/` 和 `public/`
- `package.json` 和 `package-lock.json`（存在时）
- `.env.example`

归档明确排除 `node_modules` 和 `.env`，避免把依赖和密钥放进备份。请另行通过
NAS 的机密管理或受控的加密备份保存 `.env` 和 Tunnel 凭据，并限制访问权限；仅恢复
归档还不够，必须把生产 `.env` 和 Tunnel 凭据恢复到受限位置后才能重新启动。

建议：

- 每次发布前备份一次。
- 至少保留 4 个最近归档和一组异地备份。
- 定期试恢复，而不是只检查归档是否存在。
- 备份目录不要和项目目录使用同一块故障域。

### 恢复

1. 停止服务：

```sh
scripts/nas-stop.sh
```

2. 校验归档：

```sh
tar -tzf /volume1/backups/tourism/tourism-YYYYMMDD-HHMMSS.tar.gz >/dev/null
```

3. 恢复：

```sh
scripts/nas-restore.sh /volume1/backups/tourism/tourism-YYYYMMDD-HHMMSS.tar.gz
```

4. 恢复配置并重建：

```sh
npm ci
npm run validate:content
npm run check
npm test
scripts/nas-start.sh
curl --fail --silent http://127.0.0.1:3000/health
```

恢复后检查内容版本、已发布题量和首页访问。恢复脚本会覆盖归档中的对应文件；由于生产
容器只读且内容打包进镜像，恢复后必须运行 `scripts/nas-start.sh` 重建容器，恢复才会
生效。恢复前确认当前目录仍有一份可用备份。

## 9. 日志、监控与容量

- Compose 使用 `restart: unless-stopped`，NAS 重启后服务会自动恢复。
- `cloudflared` 也应由 NAS 的启动项或容器重启策略自动拉起。
- 日志不要记录 token、学习记录、录音或完整题目内容。
- 使用 NAS 日志轮转，设置合理的保留期；Tunnel 日志和容器日志分别管理。
- 监控至少覆盖：`/health`、磁盘空间、Docker 容器状态、Cloudflare Tunnel 状态。
- 观察 `429 rate_limited`：如果 `cloudflared` 与应用在同一台 NAS 本机回源，应用看到的是回环地址，`RATE_LIMIT` 会近似成为全站每分钟上限，而不是每个考生独立上限。
- 容器以 `read_only: true` 运行，内容来自构建时的镜像层；发布后必须重建容器，不能直接修改 NAS 上运行中的文件。
- `content/sources/` 和 `content/drafts/` 的写入能力应限制在维护环境。

## 10. 更新、回滚与停机

### 发布新版本

```sh
git pull --ff-only origin main
npm ci
npm run validate:content
npm run check
npm test
scripts/nas-backup.sh /volume1/backups/tourism
scripts/nas-start.sh
```

### 回滚应用版本

1. 记录当前提交和内容版本。
2. 从受控 Git 历史恢复已知可用提交，或在本地分支完成 revert。
3. 恢复对应备份归档并运行 `scripts/nas-start.sh`。
4. 验证 `/health` 和内容版本。
5. 把回滚原因、提交和验证结果写进维护记录。

不要直接编辑 NAS 上的生产 JSON 作为长期修复；修复应回到仓库、通过审核和测试后再发布。

## 11. 故障排查

| 现象 | 先检查 | 处理 |
| --- | --- | --- |
| `curl` 健康检查失败 | `docker compose ps`、容器日志、端口占用 | 确认 3000 端口未被占用，重新运行 `scripts/nas-start.sh` |
| 构建时报缺少依赖 | Docker 构建日志、`package-lock.json` | 使用 `npm ci` 安装锁文件依赖；重新构建镜像 |
| 容器启动后立即退出 | `docker compose logs tourism` | 检查 Node 版本、文件权限和端口配置 |
| Tunnel 返回 502/530 | `cloudflared` 状态、回源 YAML、本机健康检查 | 确认回源是 `http://127.0.0.1:3000` 且服务正在运行 |
| 手机打不开但 NAS 本机正常 | DNS、HTTPS、Cloudflare 代理、防火墙 | 用另一网络测试 HTTPS 域名，不要开放明文端口 |
| PWA 无法安装 | 是否 HTTPS、Manifest 和 Service Worker 是否 200 | 修正 HTTPS/回源后重新打开页面 |
| 题库未更新 | `/api/exam/versions`、Service Worker、浏览器缓存 | 确认已运行 `scripts/nas-start.sh` 重建容器；在「我的」点「刷新题库」，确认内容版本递增 |
| 用户频繁 `429` | 容器日志、`RATE_LIMIT`、Tunnel 回源地址 | Tunnel 本机回源时按全站流量评估并调高 `RATE_LIMIT` |
| 管理员接口 401 | 生产默认关闭管理 API | 这是预期行为；需在独立管理环境发布内容，不要把生产容器改为可写 |
| 管理页被公开访问 | Access 策略、路径规则、`ADMIN_TOKEN` | 立即收紧 Cloudflare Access；必要时停止管理员入口 |

## 12. 安全检查表

发布前逐项确认：

- [ ] Tunnel 只暴露必要 hostname，没有暴露 NAS 管理界面、SSH、SMB 或 Docker socket。
- [ ] 生产容器的管理 API 保持关闭；若启用独立管理入口，已有 Access、强随机 `ADMIN_TOKEN` 和受控可写卷。
- [ ] 3000 端口只监听 `127.0.0.1`，没有公网端口转发。
- [ ] HTTPS 有效，HTTP 不会被当作正式入口。
- [ ] `cloudflared`、`.env` 和 API Key 不在 Git 中。
- [ ] 已配置日志轮转，不记录凭证和考生数据。
- [ ] 已按 Tunnel 回源方式确认 `RATE_LIMIT` 不会误伤正常流量。
- [ ] 已配置 Backup + Restore 演练。
- [ ] 已设置依赖和 Docker 镜像的安全更新计划。
- [ ] 已测试 iOS Safari 和 Android Chrome 的安装与题库刷新。
- [ ] 已确认云服务和考试相关内容的版权、平台规则和合规边界。

## 13. PWA 缓存与数据边界

Service Worker (`public/sw.js`) 采用 network-first：在线时始终优先请求 NAS 上的最新
内容，仅在 NAS 不可达时回退到最近一次成功缓存。发布新内容后不需要修改 Service
Worker；缓存按用户设备本地维护，内容版本在界面「我的」中显示。

浏览器本地数据不等于 NAS 备份：

- 学习记录、错题、模考成绩在考生浏览器，不在服务器。
- 换手机、重装或清理浏览器数据前导出学习记录。
- NAS 备份只保护题库、需求和部署资源，不能恢复考生浏览器里的数据。
- 考生删除浏览器数据且没有导出时，现阶段无法从服务器恢复。
