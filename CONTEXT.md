# Tourism Context

## Purpose

Tourism is a study service for the national tour-guide qualification exam,
with English-language practical-exam training for the selected province. The
MVP starts with Sichuan candidates and is designed to expand to every province
without duplicating the application code.

## Language

**Written question**:
A candidate-facing question in the shared national written-exam question bank.
_Avoid_: Practical training material, generation item

**Question type contract**:
The declarative rules for one question type: stable identifier, display label, selection mode, correct-option limits, option limits, and any fixed options. Generation, review, publication, presentation, and scoring must all use the same contract.
_Avoid_: Screen-specific type behavior

**Question type identifier**:
A stable, never-reused identifier for one question type. Its display label may change, but its answer and scoring semantics may not change without a new identifier and a migration.
_Avoid_: Reused type ID, mutable type meaning

**Question type catalog**:
The versioned set of question types defined by the national written-exam configuration. Generation, review, publication, and candidate presentation all use this catalog as the authoritative list, and the catalog is delivered with the questions under the same content version. An invalid catalog blocks publication.
_Avoid_: Per-screen type list, generator-only enum, client-only enum

**Generation mode**:
The process used to create a draft. Past-paper extraction, written simulation, and chapter practice target the written-question review queue; practical-material drafting targets the practical-material review queue.
_Avoid_: Question type

**Generation policy**:
The versioned rules for a generation mode, including which question types it may produce and their target distribution. It is not part of a question type definition.
_Avoid_: Question type rule

**Question type**:
The answer format of a written question: single-choice, multiple-choice, or true-false.
_Avoid_: Generation mode, content type

**Single-choice question**:
A written question with exactly one correct option.
_Avoid_: Single question, option question

**Exact-match scoring**:
MVP written-question scoring is correct only when the selected options exactly match the correct options; multiple-choice questions receive no partial credit.
_Avoid_: Partial-credit scoring

**Multiple-choice question**:
A written question with at least two correct options. Every option may be structurally correct, although generation policy should normally include at least one distractor.
_Avoid_: Multi-answer question when the answer shape is unclear

**True-false question**:
A written question with exactly two options, "正确" and "错误" in that order, and exactly one correct option. It remains a distinct question type even when its answer control reuses single-choice behavior.
_Avoid_: Two-option single-choice question

**Type-driven presentation**:
Candidate-facing classification is determined only by a written question's question type from the question type catalog. It is never inferred from option count or answer shape, and the question type is a question property rather than a top-level navigation category.
_Avoid_: Shape-based question classification, type-based navigation

**Invalid written question**:
A written question whose question type is absent from the question type catalog or whose answer data does not satisfy that type. It must not be presented to a candidate.
_Avoid_: Fallback question

**Written-question review queue**:
Drafts intended for the national written question bank. Items are reviewed and published only under the question type catalog.
_Avoid_: Shared content queue

**Practical-material review queue**:
Drafts intended for a province practical-exam pack. Items are reviewed and published under the practical training material schema.
_Avoid_: Written-question queue

**Practical training material**:
Province-pack material for on-site exam training, including attraction explanations and interview Q&A. It is not a written question and is not part of the written question bank.
_Avoid_: Practical question type, practical material as a question type

**Candidate installation**:
One device-local copy of the candidate-facing app that holds the study record for exactly one candidate.
_Avoid_: User, account, session

**Study record**:
The practice attempts, wrong-question marks, and mock results that belong to one candidate installation.
_Avoid_: Progress, user data, score

**Study-record export**:
A candidate-controlled file that can be imported into another candidate installation to restore its study record.
_Avoid_: Sync, cloud backup, server copy

**Local-first study data**:
The boundary that a study record lives on the candidate's own device and is not uploaded to the server in the MVP.
_Avoid_: Server-side progress, account sync

**Content version**:
The identifier of one published revision of exam content. A candidate installation holds exactly one content version at a time.
_Avoid_: App version, build number, release

**Cached content package**:
The last content version a candidate installation loaded successfully, kept for use while the server is unreachable.
_Avoid_: Downloaded bank, offline copy, local bank

**Stale content**:
A cached content package whose content version is no longer the one the server publishes. A candidate must be able to see that they are studying stale content.
_Avoid_: Old questions, outdated app

**Study-record export format**:
The versioned shape of a study-record export: the progress counters, the content version they were earned under, and an export timestamp. It does not carry per-attempt answer history.
_Avoid_: Backup format, sync payload

**Candidate settings**:
The candidate-facing surface that holds install guidance, study-record export and import, and the currently served content version.
_Avoid_: Admin panel, account page, profile


- **Candidate**: A person preparing for the national tour-guide qualification
  exam and, where applicable, an English-language practical exam.
- **National written exam**: The shared written-exam scope defined by the
  current national syllabus.
- **Provincial practical exam**: A province-specific on-site exam, including
  Sichuan's 2026 syllabus for the MVP.
- **Question source**: The provenance category for study content: official
  public material, self-authored or licensed content, or recalled questions.
- **Past exam question**: A question from a previous exam, clearly labeled with
  year, province, subject, source, and review status.
- **Province pack**: Configuration and content for one province's practical
  exam, including attractions, scripts, questions, and scoring guidance.

## MVP Scope

- Candidate-facing web/PWA, mobile-first and desktop-compatible.
- National written-exam outline, study progress, chapter practice, past exam
  questions, wrong-question review, mock exams, and basic statistics.
- The written exam always follows the four subjects and scope in the national
  syllabus. Sichuan is the first province pack; its practical-exam interview
  training uses Chinese explanations with English practice.
- Past questions are a first-class source, separate from mock questions. Only
  public, licensed, or independently authored material is included.
- A voluntary support/donation entry may be displayed. It does not unlock
  content, create membership rights, or promise examination results.

## Deployment and privacy boundary

- The MVP runs on a home NAS and is exposed through a Cloudflare Tunnel.
- The operating target is the free tier; no paid cloud service is required for
  the initial release.
- The tunnel is not an application security boundary. Authentication,
  rate-limiting, backups, update procedures, and NAS isolation remain required
  before public access.
- Candidate progress may start locally. Cloud synchronization is optional
  future work; recordings should not be retained by default.
