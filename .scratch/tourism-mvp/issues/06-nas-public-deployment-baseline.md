# 06 — 完成 NAS 与 Cloudflare Tunnel 公网部署安全基线

**What to build:** 让维护者可以在家用 NAS 上启动、备份和恢复 Tourism，并通过 Cloudflare Tunnel 对外提供服务；公网开放前具备认证、限流、日志脱敏、更新和 NAS 隔离的最低安全基线。

**Blocked by:** 04 — 实现整卷模考与基础统计

**Status:** ready-for-agent

- [ ] 提供 NAS 可执行的启动和停止说明，默认使用免费软件和本地存储。
- [ ] 提供 Cloudflare Tunnel 配置边界，不把 Tunnel 当作应用层认证。
- [ ] 为管理能力配置认证，为公网请求配置基础限流。
- [ ] 记录不含凭证、完整录音或不必要敏感信息的脱敏日志。
- [ ] 提供题库、版本化内容和本地学习数据的备份恢复说明。
- [ ] 记录 NAS 最小权限、服务隔离和依赖更新要求。
- [ ] 验证 NAS 重启、服务恢复和 Cloudflare Tunnel 访问路径。
