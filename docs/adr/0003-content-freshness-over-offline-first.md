# Content freshness outranks offline-first caching

The candidate-facing app caches the last successfully loaded content package so
that practice and mock exams keep working when the NAS is unreachable, but it
treats that copy as **stale content** and keeps the **content version** visible
at all times. When the network is available, the app prefers the server copy and
tells the candidate that a newer content version exists instead of swapping it
in silently.

## Context

Published content has already changed answer *semantics*, not just wording:
`draft-pl-014` and `draft-pl-025` moved from `multiple_choice` to
`single_choice` in content version 2026.1.8. A candidate holding the previous
version would study an answer the maintainer has since rejected.

The obvious alternative was an offline-first bank that downloads once and
rarely refreshes. That maximizes offline comfort at the cost of letting a
candidate rehearse superseded answers for weeks. For an exam-preparation tool
the correctness of the answer outranks the convenience of the cache.

## Consequences

- `/api/exam` is served network-first with a cached fallback, never cache-first.
- The question type catalog travels inside the same response as the questions,
  so a cached package is always internally self-consistent even when stale.
- Silent background replacement is not acceptable. The candidate is told when
  the version behind their studies is no longer current.
- The app degrades to "unavailable" rather than to "confidently wrong" when it
  cannot establish which content version it is serving.
