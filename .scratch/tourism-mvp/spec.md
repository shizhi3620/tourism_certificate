# Tourism MVP 规格

Status: ready-for-agent
Type: task

## Problem Statement

准备参加 2026 年四川英文导游资格证考试的个人考生，需要一个以官方考试
大纲为范围基线的学习工具，把章节练习、合法来源的历年真题、错题复习、
整卷模考和基础统计组织成一个可持续使用的笔试闭环。现有项目已具备
最小浏览器学习壳，但正式题库、版本化考试配置和后续省份扩展需要明确、
可审核的规格。

## Solution

建设 Tourism MVP：移动端优先、兼容桌面浏览器，首期服务四川考生。P0
交付全国笔试闭环，P1 再交付四川现场英文训练。内容以 2026 年全国笔试
大纲和四川现场考试大纲为基线，题目按来源、年份、地区和审核状态管理。
P0 采用浏览器本地存储，不强制账号和云同步；服务运行在家用 NAS，通过
Cloudflare Tunnel 和免费方案对外访问。全国化采用共享业务能力加省份数据包。

## User Stories

1. As a 四川英文导游资格证考生, I want to view the official syllabus outline, so that I can understand the exam scope.
2. As a candidate, I want to see subjects and chapters, so that I can choose a focused study area.
3. As a candidate, I want to see my chapter progress, so that I can resume study after leaving the app.
4. As a candidate, I want to practice questions by chapter, so that I can learn one knowledge area at a time.
5. As a candidate, I want to submit an answer and see the result, so that I can correct misunderstandings immediately.
6. As a candidate, I want to read an explanation, so that I understand why an answer is correct.
7. As a candidate, I want past exam questions separated from mock questions, so that I can distinguish evidence from practice content.
8. As a candidate, I want each past question labeled with year, region, subject, source, and review status, so that I can judge its reliability.
9. As a candidate, I want wrong answers automatically added to my wrong-question book, so that I can revisit weak areas.
10. As a candidate, I want to retry wrong questions, so that I can verify improvement.
11. As a candidate, I want to take a full mock exam, so that I can practice the complete written-exam workflow.
12. As a candidate, I want the mock exam to record answers, timing, and score, so that I can evaluate readiness.
13. As a candidate, I want basic statistics for attempts, accuracy, chapters, past questions, and mocks, so that I can identify priorities.
14. As a candidate, I want study data to remain available in my browser, so that I can use the MVP without an account.
15. As a candidate, I want the app to work well on a phone, so that I can study in short sessions.
16. As a candidate, I want desktop compatibility, so that I can review content on a larger screen.
17. As a candidate, I want clear notices when content is a demo or pending review, so that I do not mistake it for official material.
18. As a candidate, I want a voluntary support link that does not interrupt study, so that I can support the project without losing access.
19. As a content maintainer, I want versioned structured content, so that syllabus and question updates can be reviewed and rolled back.
20. As a content maintainer, I want only reviewed questions in default practice and mocks, so that unverified material is not presented as reliable.
21. As a maintainer, I want exam configuration versioned separately from code, so that official rule changes do not require hard-coded rewrites.
22. As a future province maintainer, I want province-specific practical content represented as a data pack, so that new provinces do not require copied business code.
23. As a NAS operator, I want the service to start with a documented command, so that I can recover it after a restart.
24. As a NAS operator, I want backups and restore instructions, so that local content and study data are recoverable.
25. As a public-service operator, I want authentication, rate limiting, log redaction, and NAS isolation before public exposure, so that a tunnel is not mistaken for application security.

## Implementation Decisions

- Use the existing Node.js 22, dependency-free HTTP server as the first delivery
  seam.
- Serve the browser application from the HTTP root and expose versioned exam
  content through a read-only JSON API.
- Store exam metadata, chapters, questions, provenance, review state, and
  configuration in versioned structured content files.
- Use browser local storage for P0 attempts, wrong-question state, and basic
  statistics; do not require accounts or cloud synchronization.
- Keep source categories distinct: official public material, self-authored or
  licensed content, and recalled questions.
- Keep past exam questions distinct from mock questions. Recalled questions
  must be labeled non-official and pending review.
- Exclude pending-review content from default practice and mock selections.
- Expose the optional support link only when `DONATION_URL` is configured; it
  never gates content or creates membership rights.
- Model future practical exams as province packs. Sichuan is the first pack;
  P0 does not implement practical audio analysis or AI scoring.
- Treat the two supplied 2026 syllabus PDFs and later official announcements as
  the authority for exam scope, not hard-coded assumptions.

## Testing Decisions

- Test the external HTTP contract through the existing Node test runner.
- Verify health responses, unknown-route behavior, static app delivery, versioned
  exam-content delivery, and optional support-link behavior.
- Verify the browser-facing content is labeled as demo/pending where applicable.
- Keep test data synthetic; do not commit private candidate data, credentials,
  recordings, or unlicensed question content.
- Add behavior tests at the HTTP seam before adding lower-level abstractions.

## Out of Scope

- Training-institution or teacher administration.
- Other languages or nationwide province content in the first release.
- Mandatory accounts, cloud synchronization, paid cloud infrastructure, or
  paid AI services.
- Membership, paid question banks, or donation-based access.
- Unlicensed copying of the reference project's question bank.
- P1 audio retention, pronunciation analysis, AI commentary, or automatic
  practical-exam scoring.
- Claims about pass rates or examination outcomes.

## Further Notes

- The current content file contains one clearly labeled process-demo question;
  it is not an official or historical exam question.
- Before public NAS exposure, the operator must complete authentication,
  rate-limiting, backups, log redaction, update, and isolation setup.
- Requirements versions use semantic-style `vMAJOR.MINOR.PATCH`; content data
  versions are independent and must be bumped when syllabus or question data
  changes.
