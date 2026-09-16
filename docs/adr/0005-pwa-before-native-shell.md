# PWA before a native shell

The candidate-facing app is delivered as an installable **Progressive Web App**
on iOS and Android. A Capacitor or native rewrite is deferred, not rejected, and
the PWA must not take a shape that would make a later native shell harder.

## Context

The candidate experience is a 72 KB folder of plain HTML, CSS, and ES modules
with no framework and no build step. It already runs in iOS Safari and Android
Chrome; what it lacks is a home-screen icon, offline resilience, and protection
from iOS storage eviction.

A native shell would need Xcode, the Android SDK, store signing, and Apple's
annual developer fee before a single candidate could use it. Apple's App Review
Guideline 4.2 also rejects a shelled website with no native capability of its
own, so store distribution is not achievable by wrapping the current app alone.

## Consequences

- The install experience is two separate implementations. iOS shows manual
  "Add to Home Screen" instructions and detects install state with
  `navigator.standalone`; Android uses the real `beforeinstallprompt` event.
- The app must not depend on a build step. Service-worker caching covers the
  existing static assets and the two content endpoints, nothing more.
- Native-only capabilities (push notifications, background recording) remain
  out of scope and are the reason a later Capacitor phase could still be
  justified.
