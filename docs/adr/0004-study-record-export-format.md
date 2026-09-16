# Study-record export carries progress counters, not answer history

A **study-record export** carries the per-question progress counters
(`attempts`, `correct`, `wrong`), the **content version** those counters were
earned under, an export timestamp, and a format version. It deliberately does
not carry per-attempt answer history.

## Context

The study record stores `wrong` as a boolean and never stores which option the
candidate selected. Without the selected option, an imported record cannot be
re-scored against a newer content version. That constraint already exists in
the app; the export format simply refuses to pretend otherwise.

The alternative was an event-stream record: every attempt with question ID,
selected option, timestamp, and content version. That would make re-scoring and
richer statistics possible, but it means replacing the record model in
`public/app.js` and rewriting `recordFor`, `answer`, and `renderWrong` — turning
a packaging task into a data-model migration.

## Consequences

- The format version is load-bearing. Exports already live on candidates'
  devices and cannot be retrofitted, so a future format change must detect and
  migrate older files by that version.
- Importing an export whose content version differs from the current one must
  warn that some statistics may not match current answers, because the app
  cannot recompute them.
- Adding a "last wrong selection" field later remains possible without changing
  the export format's outer shape, but existing exports will still lack it.
