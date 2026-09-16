# Tourism

全国导游资格证学习 MVP，首期提供四川现场考试英语面试训练；采用无依赖
Node.js 22 HTTP 服务和浏览器本地存储。

## 开发

```sh
npm install
npm run check
npm test
npm start
```

公开内容来自 `content/exam.json`（全国四科笔试版本）和
`content/sichuan-practical.json`（四川现场数据包）。`sourceStatus` 不是
`published` 的题目不会从 `/api/exam` 返回。学习记录、错题和模考成绩只保存在
浏览器；现场训练不上传录音，也不提供 AI 评分。

题库维护、审核、上传和更新流程见 [`content/README.md`](content/README.md)；
当前通过 Git 发布内容，不提供公网题库上传接口。

## 用户端与安装

用户端是安装式 PWA，正式访问需使用 HTTPS；本地开发时可在同一局域网通过
`http://<Mac IP>:3000` 测试页面，但安装和 Service Worker 等能力会受安全上下文限制。
学习记录只保存在本机，不上传服务器；换手机、重装或清理浏览器数据前，请在「我的」中导出学习记录，
再导入到新设备。离线时使用最近一次成功加载的题库，界面始终显示当前内容版本，联网后可点「刷新题库」更新。

### 支持的浏览器

| 平台 | 建议浏览器 | 支持情况 |
| --- | --- | --- |
| iOS / iPadOS | Safari（建议保持最新版本） | 推荐。通过“分享”菜单添加到主屏幕；不支持 Android 式自动安装提示。 |
| iOS / iPadOS | Chrome、Firefox、Edge 等其他浏览器 | 可浏览网页；iOS 上这些浏览器仍使用 WebKit 内核。为避免安装入口差异，建议回到 Safari 完成“添加到主屏幕”。 |
| Android | Chrome | 推荐。支持应用内“立即安装”按钮，也可从浏览器菜单“安装应用”或“添加到主屏幕”。 |
| Android | Edge、Samsung Internet 等 Chromium 内核浏览器 | 可用。安装入口名称可能不同，通常在浏览器菜单中。 |
| 桌面端 | Chrome、Edge、Safari | 可作为普通网页使用；不作为主要安装路径。 |

正式部署必须使用 HTTPS。局域网 IP 地址下，浏览器通常不会把页面识别为可安装 PWA，
因此真机测试安装流程时应使用 Cloudflare Tunnel 或其他 HTTPS 地址。

### iOS / iPadOS 操作

1. 使用 Safari 打开题库地址。
2. 点击浏览器的“分享”按钮。iPhone 通常位于底部；iPad 通常位于顶部。
3. 在分享列表中向下滑动，选择“添加到主屏幕”。
4. 确认名称后点击“添加”。
5. 回到主屏幕，点击新出现的题库图标启动；以独立窗口打开表示安装成功。

iOS 的 Safari 可能会清除 7 天未访问的网站脚本存储。添加到主屏幕后，该 Web App
可豁免这项清理，因此长期使用前建议先安装到主屏幕，不要长期停留在普通标签页。

### Android 操作

1. 使用 Chrome 打开题库的 HTTPS 地址。
2. 如果页面出现“立即安装”，直接点击并按提示确认。
3. 如果没有按钮，点击 Chrome 右上角的“⋮”，选择“安装应用”或“添加到主屏幕”。
4. 按系统提示确认安装。
5. 从主屏幕或应用列表打开题库；以独立窗口打开表示安装成功。

### 数据注意事项

- 安装前后是否共享原有浏览器存储，不同系统和浏览器版本并不完全一致；安装后请先确认「我的」中的学习记录。
- 如果安装后发现记录为空，可在原浏览器页面导出学习记录，再从安装后的「我的」中导入。
- Android 卸载应用或清理 Chrome 数据、iOS 删除主屏幕图标或清理浏览器网站数据，都可能删除本机学习记录。
- 换设备、重装或清理数据前，必须先导出学习记录；恢复时使用“导入学习记录”。

## 部署

NAS/Cloudflare Tunnel 的最小权限、认证、限流、备份和恢复步骤见
[`docs/deployment-nas-cloudflare.md`](docs/deployment-nas-cloudflare.md)。
部署前不要把 Tunnel 当作应用认证；先配置 Cloudflare Access 和 NAS 防火墙。

全国导游资格证备考 MVP，首期覆盖全国大纲四个笔试科目，并通过省份数据包
扩展各地区现场考试；四川现场考试的面试训练使用英语。

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
- `content/README.md` - content generation, review, and update workflow.
- `public/` - installable PWA study experience with local progress storage.
- `public/sw.js` - network-first service worker; cached fallback only when the NAS is unreachable.
- `public/manifest.webmanifest` - PWA manifest and home-screen icons.
- `public/study-record.js` - versioned study-record export and import.
- `test/server.test.mjs` - smoke tests for the public HTTP contract.
- `CONTEXT.md` - initial domain vocabulary and boundaries.
- `requirements/PRD-001-tourism-mvp-v0.1.1.md` - formal MVP product requirements.
