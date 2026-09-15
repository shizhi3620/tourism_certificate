# 内容包维护

## 文件职责

- `exam.json`：全国大纲四个笔试科目、章节、笔试题目和模考配置。
- `sichuan-practical.json`：四川现场考试数据包；英语只用于现场面试训练。

## 生成题目

题目可以来自官方公开材料、合法授权内容或自行编写内容。不要复制来源不明
的题库。每道题必须填写题目 ID、章节、题型、题源、审核状态、来源说明、题干、
选项、答案和解析，还必须填写对应的大纲要求、教材科目、教材章节、来源页码
（或 OCR 页码）和支持答案的原文引用片段；历年真题还应填写年份和地区。

导入 PDF/教材并生成草稿：

```sh
npm run import:source -- /path/to/material.pdf "政策与法律法规" 全国
npm run generate:draft -- content/sources/<source-id>.txt
```

`import:source` 会提取文本并生成来源清单；`generate:draft` 默认使用 DeepSeek
的 OpenAI-compatible API 生成 `pending_review` 草稿。需要先设置
`DEEPSEEK_API_KEY`，可选设置 `DEEPSEEK_BASE_URL`（默认
`https://api.deepseek.com/v1`）和 `DEEPSEEK_MODEL`（默认 `deepseek-chat`）。
仍可使用 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL` 兼容其他
OpenAI-compatible 服务。源文件和草稿
默认被 `.gitignore` 忽略，避免把教材、密钥或未审核内容提交到仓库。

如果配置的是第三方模型服务，提取出的教材文本会发送到该服务；使用前必须
确认资料授权、隐私和服务条款。希望内容留在 NAS 时，应使用 NAS 内部部署的
OpenAI-compatible 服务，并将 `OPENAI_BASE_URL` 指向内网地址。

生成工具或 AI 只能辅助起草，不能替代人工核对大纲、答案、解析、版权和语言。
生成题还必须带有 `syllabusRequirement`、`textbookSubject`、
`textbookChapter`、`sourcePages` 和 `sourceExcerpt`；审核页面会展示这些定位，
发布前缺少任一项会被拒绝。

扫描 PDF 可用 DeepSeek 进行逐页 OCR 试运行：

```sh
npm run ocr:source -- content/sources/<source-id>-原文件.pdf
```

该命令会在本机用 PDFKit 渲染页面，再逐页调用 DeepSeek 视觉输入接口；
默认模型为 `DEEPSEEK_OCR_MODEL`（未设置时使用 `deepseek-chat`），结果写入
同目录的 `.ocr.txt`。不同 DeepSeek 账户/模型对图片输入的支持可能不同；
如果接口不支持视觉输入，会明确报错，不会伪造文字。OCR 文本仍需人工抽查。
当前 macOS 实现使用系统 `PDFKit` 将每页渲染为 PNG；临时图片放在
`content/drafts/ocr-<时间戳>/`，OCR 完成后可删除该目录。
如果材料包含明确水印，可在管理页面填写水印文字（多个用英文逗号分隔）。
系统只会从 OCR 输出中删除包含这些明确词语的整行，不会修改原始 PDF，也不会
擅自删除无法确认的页眉页脚。

## 审核与发布

1. 新题先设置 `sourceStatus: "pending_review"`。
2. 由维护者核对来源、答案、解析、章节和文字。
3. 审核通过后改为 `sourceStatus: "published"`。
4. 修改任何已发布题目时递增 `contentVersion`，保留变更记录。
5. 运行 `npm run validate:content`、`npm run check` 和 `npm test`。

服务只会通过 API 返回已发布题目，待审核题不会进入默认练习和模考。

## 上传和更新

当前没有公网题库上传接口，这是有意的安全边界。通过 Git 在受控环境发布：

本地内容管理页面已提供上传和 DeepSeek 草稿生成入口：启动服务后访问
`/admin`，设置 `ADMIN_TOKEN` 后使用管理令牌登录。支持 PDF、TXT、MD，单文件
本次上传总大小最大 200 MB。教材和大纲首次 OCR 后会写入 `content/sources/materials.json`
材料库；后续可在管理页面加载并勾选已启用材料生成，不需要重复上传或 OCR。
相同文件按 SHA-256 跳过重复识别；旧材料可以停用，来源文件和 OCR 文本仍保留。
未勾选“保存到材料库”的本次上传只用于当前生成。生成结果仍写入
`content/drafts/` 并保持 `pending_review`。
管理员页面不是公开用户功能，NAS/Cloudflare 部署时必须配置强随机令牌，并限制
管理入口只允许内网或受保护访问。

```sh
# 本地验证
npm run validate:content
npm run check
npm test

# 提交并推送内容变更
git add content/
git commit -m "Update reviewed exam content"
git push origin main
```

NAS 更新：

```sh
git pull --ff-only origin main
npm ci
npm run validate:content
npm run check
npm test
scripts/nas-backup.sh /volume1/backups
scripts/nas-start.sh
```

`nas-start.sh` 会重建容器；更新前先备份。Cloudflare Tunnel 不需要重新上传
题库，只需确认本地服务健康且 Tunnel 仍指向 `127.0.0.1:3000`。
