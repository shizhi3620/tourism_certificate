# NAS 与 Cloudflare Tunnel 部署基线

本项目的 HTTP 服务是只读内容服务，学习记录保存在考生浏览器，不上传 NAS。
公网开放前必须完成以下步骤：

1. 在 NAS 上创建专用低权限账户和独立目录，启用 Docker/Compose 的自动安全更新；
   不要把 NAS 管理界面、SSH 或 Docker socket 暴露给 Tunnel。
2. `cp .env.example .env` 后执行 `scripts/nas-start.sh`，确认
   `curl http://127.0.0.1:3000/health` 返回 `{"status":"ok"}`；NAS 重启后由
   Compose `restart: unless-stopped` 恢复服务。
3. 用 Cloudflare Zero Trust 创建 Tunnel，只把一个 hostname 转发到
   `http://127.0.0.1:3000`。Tunnel 不是应用认证：在 Cloudflare Access 配置
   管理员路径和维护者身份认证，并限制管理员邮箱/组；公开学习页面仍只读。
4. 应用自带按来源地址每分钟限流（默认 120 次，可用 `RATE_LIMIT` 调低），
   安全响应头和无请求内容日志。不要添加打印 token、学习记录、录音或完整题目
   提交内容的日志。生产日志应由 NAS 轮转并设置最短保留期。
5. 每次发布前执行 `npm ci`, `npm run check`, `npm test`；内容包独立版本化。
   用 `scripts/nas-backup.sh /volume1/backups` 备份，灾难恢复时先校验归档再运行
   `scripts/nas-restore.sh <archive>`，随后重新构建并检查 `/health`。

Cloudflare Tunnel 配置示例（凭据文件只放在 NAS，绝不提交仓库）：

```yaml
tunnel: <tunnel-uuid>
credentials-file: /etc/cloudflared/<tunnel-uuid>.json
ingress:
  - hostname: study.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

当前没有写入式管理 API，因此不存在可被公网调用的题库管理端点；新增管理功能
必须先增加独立认证、审计和 CSRF 防护。录音训练使用浏览器临时录音，默认不上传。

## PWA 缓存

服务端仍为只读内容服务，Service Worker (`public/sw.js`) 采用 network-first：
在线时始终返回最新题库，仅在 NAS 不可达时回退到最近一次成功缓存。发布新内容后
无需修改 Service Worker；缓存按用户设备本地维护，内容版本在界面「我的」中显示。
