# Tourism

四川英文导游资格证备考 MVP，后续通过省份数据包扩展到全国。

## MVP 范围

- 以 2026 年全国笔试大纲为共同范围基线。
- 首个省份为四川，现场考试依据四川 2026 年现场考试大纲。
- 章节练习、历年真题、错题复习、整卷模考和基础学习统计。
- 历年真题与模拟题分开管理，并记录年份、省份、科目、来源和审核状态。
- 产品界面和知识点解释使用中文；现场考试训练使用英文并提供中文释义。
- 题库只收录公开、授权或自行编写的内容，不默认复制第三方项目题库。

本仓库中的两份 PDF 是当前内容建设的参考基线：

- `附件2：《2026年全国导游资格考试笔试大纲》.pdf`
- `附件3：《四川省2026年全国导游资格考试现场考试大纲》.pdf`

## 部署边界

MVP 预期运行在家用 NAS 上，通过 Cloudflare Tunnel 对外访问，优先使用
Cloudflare 免费方案和本地存储，不依赖付费云服务器。公开访问前仍需配置
认证、限流、备份、日志脱敏和 NAS 服务隔离；Cloudflare Tunnel 本身不是应用
层安全控制。

可以通过 `DONATION_URL` 配置一个自愿打赏入口。打赏不解锁题库、不提供会员
权益，也不构成考试结果承诺。

## Development

```bash
npm install
npm run check
npm test
npm start
```

The server listens on `PORT` (default `3000`) and exposes:

- `GET /health` - returns the service health status.
- `GET /` - serves the mobile-first study app.
- `GET /api/exam` - returns the versioned exam content configuration.

Copy `.env.example` to `.env` when local configuration is needed. Do not
commit credentials or local runtime data.

## Structure

- `src/server.mjs` - HTTP server and request routing.
- `content/exam.json` - versioned syllabus, chapter and question data.
- `public/` - browser study experience with local progress storage.
- `test/server.test.mjs` - smoke tests for the public HTTP contract.
- `CONTEXT.md` - initial domain vocabulary and boundaries.
- `requirements/PRD-001-tourism-mvp-v0.1.1.md` - formal MVP product requirements.
