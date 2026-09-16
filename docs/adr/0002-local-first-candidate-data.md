# Local-first candidate data with installation-scoped identity

The candidate-facing app has no user accounts and no server-side study data.
A candidate's study record is scoped to one **candidate installation**, a
device-local copy of the app, and travels between devices only through an
explicit **study-record export** the candidate controls.

## Context

The MVP runs on a home NAS behind a Cloudflare Tunnel and is documented as a
read-only content service that never receives study records. Cross-device
sync, email login, and third-party identity were all considered and deferred.

iOS Safari deletes script-writable storage after seven days without first-party
interaction, but an added-to-home-screen web app is exempt. That makes the
installation boundary load-bearing: a candidate who never installs the app can
lose their record through normal browser behaviour, not through user error.

## Consequences

- The candidate-facing app must actively guide iOS users through "Add to Home
  Screen", because iOS exposes no install prompt API.
- Study-record export/import is required, not optional. Whether adding the app
  to the home screen preserves existing Safari storage is not reliably
  documented, so no design may assume it does.
- Adding real accounts later means introducing a server-side data store,
  authentication, retention, and deletion rules. The record shape keeps an
  `identity` seam so that migration does not require rewriting stored records.
- The server stays a read-only content service. No endpoint may accept a study
  record in the MVP.

## Install guidance timing

Install guidance is shown once, after the candidate's first answered question —
the moment the study record stops being empty and starts being worth protecting.
It can be dismissed permanently, and the same guidance stays reachable from
**Candidate settings**. Detection uses `navigator.standalone` and the
`display-mode: standalone` media query, because iOS exposes no install API.
Android uses the real `beforeinstallprompt` flow; the two platforms do not share
one script.
