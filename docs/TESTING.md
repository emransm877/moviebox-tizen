# Testing without changing a viewer's library

Run the automated suites first. Browser tests use their own storage and fixture
responses; they are not physical-TV or universal catalogue certification.

Use a separate application identity and storage sandbox for synthetic hardware
fixtures. A direct `player.open()` call inside somebody's normal app is unsafe:
application callbacks may still refer to the previously selected real episode.
Fixture progress or end events can then replace its duration or trigger autoplay.

If an approved diagnostic must run in a real app, isolate all progress, tick, end,
audio-preference and caption-preference callbacks before opening synthetic media.
Preserve the original callbacks, remove instrumentation afterwards, and never
let a fixture write normal saved titles, history or preferences. Keep diagnostics,
certificates, device IDs and personal library snapshots outside the repository.

For real-title acceptance, use the ordinary detail/season/episode/Watch flow.
Keep runtime-mismatch safeguards enabled. A deliberately short fixture cannot
establish that a real episode changed cuts. Seek tests also need appropriate
keyframes and condition-based progress checks; a fixed half-second delay is not
a reliable network or decoder assertion.

The development bundle is deterministic and checked against its reviewed helper
digest and application identity. Only unsigned, key-free development artifacts
belong in CI. Real-device signing remains local with the existing author identity.

See [compatibility](COMPATIBILITY.md) and the workflow for the currently executed
checks. Record whether a result came from a browser fixture, injected input on a
TV, a real remote or actual decoded media; those are different kinds of evidence.
