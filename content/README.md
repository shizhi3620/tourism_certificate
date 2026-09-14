# 内容包维护

## 文件职责

- `exam.json`：全国大纲四个笔试科目、章节、笔试题目和模考配置。
- `sichuan-practical.json`：四川现场考试数据包；英语只用于现场面试训练。

## 生成题目

题目可以来自官方公开材料、合法授权内容或自行编写内容。不要复制来源不明
的题库。每道题必须填写题目 ID、章节、题型、题源、审核状态、来源说明、题干、
选项、答案和解析；历年真题还应填写年份和地区。

建议先在临时文件中生成或人工整理 JSON，再复制到正式内容文件。生成工具或
AI 只能辅助起草，不能替代人工核对大纲、答案、解析、版权和语言。

## 审核与发布

1. 新题先设置 `sourceStatus: "pending_review"`。
2. 由维护者核对来源、答案、解析、章节和文字。
3. 审核通过后改为 `sourceStatus: "published"`。
4. 修改任何已发布题目时递增 `contentVersion`，保留变更记录。
5. 运行 `npm run validate:content`、`npm run check` 和 `npm test`。

服务只会通过 API 返回已发布题目，待审核题不会进入默认练习和模考。

## 上传和更新

当前没有公网题库上传接口，这是有意的安全边界。通过 Git 在受控环境发布：

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
