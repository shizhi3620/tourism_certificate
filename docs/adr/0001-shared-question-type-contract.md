# Shared question type contract

Status: accepted
Date: 2026-09-16

Generation, review, publication, and candidate presentation previously defined question types independently, while `practical_material` was incorrectly treated as a written question type. We will use one versioned question type catalog for every written question and keep generation modes, question types, and practical materials as separate concepts.

## Decision

- The national written-exam content configuration owns the versioned question type catalog and delivers it with the questions under the same content version.
- Generation modes describe how a draft was produced. They are not question types. Past-paper extraction, written simulation, and chapter practice target the written-question review queue; practical-material drafting targets the practical-material review queue.
- Practical training materials are not written questions and do not have a question type or use the written-question publication path.
- A question type contract declares a stable identifier, display label, selection mode, correct-option limits, option limits, and optional fixed options.
- Question type identifiers are never reused. Display labels may change, but answer and scoring semantics require a new identifier and migration.
- The initial written question types are single-choice (exactly one correct option), multiple-choice (at least two correct options, with all options structurally allowed), and true-false (fixed options `正确` and `错误`, exactly one correct option).
- MVP scoring is exact-match: multiple-choice questions receive no partial credit.
- Question presentation and classification use only the question type identifier and its catalog contract. Option count and answer shape never infer or override the type. Unknown or structurally invalid types fail closed and are not shown to candidates.
- Question type drives labels and answer behavior but is not a top-level navigation category. Chapters, papers, and mock configurations decide ordering and grouping.
- Generation policies are separate from question type contracts. Past-paper extraction preserves source types; generated written content follows a versioned distribution policy.
- The same contract and validation apply during generation, review, publication, and candidate presentation. An invalid question type catalog blocks publication.

## Consequences

- Two published questions with one correct option but a multiple-choice type must be migrated to single-choice when this decision is implemented.
- The candidate API and client must consume the catalog from content rather than maintain a second enum.
- Supporting a future answer interaction requires an explicit client renderer in addition to a new catalog entry.
